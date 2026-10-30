/**
 * Integration Tests — SRU-04
 * Multi-State Refund Engine (Withdrawals, Tier-Drop Savings & Cancellations)
 *
 * Covers:
 *  1. initiateRefund — Full buyer withdrawal (REQUESTED -> PROCESSING -> COMPLETED)
 *  2. initiateRefund — Partial quantity reduction refund (PARTIALLY_REFUNDED)
 *  3. initiateRefund — Idempotency protection via idempotencyKey
 *  4. initiateRefund — Over-refund rejection (422)
 *  5. initiateRefund — Provider failure transition to FAILED and REFUND_FAILED alert
 *  6. processTierDropSavingsRefunds — Automatic savings-delta calculation and refund
 *  7. processTierDropSavingsRefunds — Idempotency on repeated execution
 *  8. HTTP Routes: POST /api/refunds/initiate, POST /api/refunds/tier-drop-savings, GET /api/refunds
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import express from "express";

process.env.PAYMENT_MODE = "mock";
process.env.NODE_ENV = "test";
process.env.CLIENT_URL = "http://localhost:5173";

import { Payment } from "../../src/models/Payment.model.js";
import { Refund } from "../../src/models/Refund.model.js";
import { Notification } from "../../src/models/Notification.model.js";
import { AuditLog } from "../../src/models/AuditLog.model.js";
import {
  createPaymentOrder,
  capturePaymentOrder,
} from "../../src/services/payments/payment.service.js";
import {
  initiateRefund,
  processTierDropSavingsRefunds,
  listRefundsForShop,
  getRefundById,
} from "../../src/services/refunds/refund.service.js";
import refundRouter from "../../src/routes/refund.routes.js";
import { _resetAdapterInstances, getPayPalAdapter } from "../../src/services/payments/paypalAdapter.service.js";

// ─────────────────────────────────────────────────────────────────────────────
// Stub Models Setup
// ─────────────────────────────────────────────────────────────────────────────

function registerStubModels() {
  if (!mongoose.models.Contribution) {
    const contributionSchema = new mongoose.Schema(
      {
        poolId: mongoose.Schema.Types.ObjectId,
        shopId: mongoose.Schema.Types.ObjectId,
        requirementId: mongoose.Schema.Types.ObjectId,
        createdByUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
        quantity: { type: Number, default: 20 },
        unit: { type: String, default: "BOX" },
        unitPriceMinor: { type: Number, default: 8000 },
        finalTotalPayableMinor: { type: Number, required: true },
        totalPaidMinor: { type: Number, default: 0 },
        totalRefundedMinor: { type: Number, default: 0 },
        verifiedSavingsMinor: { type: Number, default: 0 },
        state: {
          type: String,
          enum: [
            "PENDING_PAYMENT",
            "ACTIVE",
            "WITHDRAWN",
            "CANCELLED_UNDER_MOQ",
            "REFUNDED",
            "FINALIZED",
          ],
          default: "PENDING_PAYMENT",
        },
        currency: { type: String, default: "INR" },
      },
      { timestamps: true }
    );
    mongoose.model("Contribution", contributionSchema);
  }

  if (!mongoose.models.GroupBuyPool) {
    const groupBuyPoolSchema = new mongoose.Schema(
      {
        title: { type: String, default: "Test Pool — Coffee Beans" },
        state: { type: String, default: "LOCKED" },
        targetMoq: { type: Number, default: 100 },
      },
      { timestamps: true }
    );
    mongoose.model("GroupBuyPool", groupBuyPoolSchema);
  }

  if (!mongoose.models.PriceSnapshot) {
    const memberShareSchema = new mongoose.Schema(
      {
        contributionId: mongoose.Schema.Types.ObjectId,
        shopId: mongoose.Schema.Types.ObjectId,
        totalPayableMinor: { type: Number, required: true },
        verifiedSavingsMinor: { type: Number, default: 0 },
      },
      { _id: false }
    );

    const priceSnapshotSchema = new mongoose.Schema(
      {
        poolId: mongoose.Schema.Types.ObjectId,
        version: { type: Number, default: 1 },
        currency: { type: String, default: "INR" },
        memberShares: { type: [memberShareSchema], default: [] },
      },
      { timestamps: true }
    );
    mongoose.model("PriceSnapshot", priceSnapshotSchema);
  }
}

describe("Task SRU-04: Refund Model & Multi-State Refund Engine", () => {
  let mongoServer;
  let testUser;
  let testShop;
  let testApp;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    registerStubModels();

    testUser = { _id: new mongoose.Types.ObjectId(), role: "SHOP_OWNER" };
    testShop = { _id: new mongoose.Types.ObjectId() };

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = testUser;
      req.shop = testShop;
      next();
    });
    app.use("/api/refunds", refundRouter);
    app.use((err, _req, res, _next) => {
      const status = err.statusCode ?? 500;
      res.status(status).json({
        success: false,
        message: err.message,
        statusCode: status,
      });
    });
    testApp = app;
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });

  beforeEach(() => {
    process.env.PAYMENT_MODE = "mock";
    _resetAdapterInstances();
  });

  afterEach(async () => {
    const collections = mongoose.connection.collections;
    for (const key of Object.keys(collections)) {
      await collections[key].deleteMany({});
    }
  });

  async function createCapturedPaymentFixture(amountMinor = 160000) {
    const GroupBuyPool = mongoose.model("GroupBuyPool");
    const Contribution = mongoose.model("Contribution");

    const pool = await GroupBuyPool.create({ title: "Refund Test Pool" });
    const contribution = await Contribution.create({
      poolId: pool._id,
      shopId: testShop._id,
      requirementId: new mongoose.Types.ObjectId(),
      createdByUserId: testUser._id,
      finalTotalPayableMinor: amountMinor,
      totalPaidMinor: 0,
      totalRefundedMinor: 0,
      state: "PENDING_PAYMENT",
      currency: "INR",
    });

    const { payment } = await createPaymentOrder({
      contributionId: contribution._id.toString(),
      paymentPurpose: "INITIAL_JOIN",
      idempotencyKey: `order-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      payerUserId: testUser._id.toString(),
    });

    const captureResult = await capturePaymentOrder({
      paymentId: payment._id.toString(),
      providerOrderId: payment.providerOrderId,
      captureRequesterId: testUser._id.toString(),
    });

    return {
      pool,
      contribution: captureResult.contribution,
      payment: captureResult.payment,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Full Buyer Withdrawal Refund
  // ───────────────────────────────────────────────────────────────────────────

  it("1. Full buyer withdrawal: transitions REQUESTED -> COMPLETED, marks payment REFUNDED, contribution WITHDRAWN", async () => {
    const { payment, contribution, pool } = await createCapturedPaymentFixture(160000);

    const idempotencyKey = `refund-withdraw-${Date.now()}`;
    const result = await initiateRefund({
      paymentId: payment._id.toString(),
      amountMinor: 160000,
      reason: "BUYER_WITHDRAWAL",
      idempotencyKey,
      requesterUserId: testUser._id.toString(),
    });

    expect(result.isDuplicate).toBe(false);
    expect(result.refund).toBeDefined();
    expect(result.refund.status).toBe("COMPLETED");
    expect(result.refund.amountMinor).toBe(160000);
    expect(result.refund.reason).toBe("BUYER_WITHDRAWAL");
    expect(result.refund.providerRefundId).toMatch(/^MOCK-REF-/);

    // Verify Payment document updated to terminal REFUNDED
    const updatedPayment = await Payment.findById(payment._id);
    expect(updatedPayment.paymentStatus).toBe("REFUNDED");

    // Verify Contribution updated with totalRefundedMinor and state WITHDRAWN
    const Contribution = mongoose.model("Contribution");
    const updatedContribution = await Contribution.findById(contribution._id);
    expect(updatedContribution.totalRefundedMinor).toBe(160000);
    expect(updatedContribution.state).toBe("WITHDRAWN");

    // Verify in-app Notification dispatched
    const notifs = await Notification.find({ recipientUserId: testUser._id });
    expect(notifs.length).toBeGreaterThanOrEqual(1);
    expect(notifs.some((n) => n.type === "REFUND_COMPLETED")).toBe(true);

    // Verify AuditLog written
    const logs = await AuditLog.find({ resourceType: "REFUND", resourceId: result.refund._id });
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].action).toBe("REFUND_COMPLETED");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Partial Quantity Reduction Refund
  // ───────────────────────────────────────────────────────────────────────────

  it("2. Partial refund (QUANTITY_REDUCTION): marks payment PARTIALLY_REFUNDED, preserves contribution ACTIVE", async () => {
    const { payment, contribution } = await createCapturedPaymentFixture(160000);

    const result = await initiateRefund({
      paymentId: payment._id.toString(),
      amountMinor: 60000, // partial refund of 60,000 paise
      reason: "QUANTITY_REDUCTION",
      idempotencyKey: `refund-partial-${Date.now()}`,
      requesterUserId: testUser._id.toString(),
    });

    expect(result.refund.status).toBe("COMPLETED");
    expect(result.refund.amountMinor).toBe(60000);

    // Verify Payment document is PARTIALLY_REFUNDED
    const updatedPayment = await Payment.findById(payment._id);
    expect(updatedPayment.paymentStatus).toBe("PARTIALLY_REFUNDED");

    // Verify Contribution totalRefundedMinor incremented, state remains ACTIVE
    const Contribution = mongoose.model("Contribution");
    const updatedContribution = await Contribution.findById(contribution._id);
    expect(updatedContribution.totalRefundedMinor).toBe(60000);
    expect(updatedContribution.state).toBe("ACTIVE");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Strict Idempotency on repeated refunds
  // ───────────────────────────────────────────────────────────────────────────

  it("3. Strict idempotency: same idempotencyKey returns existing refund without double-refunding", async () => {
    const { payment, contribution } = await createCapturedPaymentFixture(160000);
    const key = `refund-idem-${Date.now()}`;

    const first = await initiateRefund({
      paymentId: payment._id.toString(),
      amountMinor: 50000,
      reason: "QUANTITY_REDUCTION",
      idempotencyKey: key,
      requesterUserId: testUser._id.toString(),
    });

    expect(first.isDuplicate).toBe(false);

    // Call again with identical idempotencyKey
    const second = await initiateRefund({
      paymentId: payment._id.toString(),
      amountMinor: 50000,
      reason: "QUANTITY_REDUCTION",
      idempotencyKey: key,
      requesterUserId: testUser._id.toString(),
    });

    expect(second.isDuplicate).toBe(true);
    expect(second.refund._id.toString()).toBe(first.refund._id.toString());

    // Contribution totalRefundedMinor MUST NOT be double-credited
    const Contribution = mongoose.model("Contribution");
    const updated = await Contribution.findById(contribution._id);
    expect(updated.totalRefundedMinor).toBe(50000);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Over-Refund Prevention (422)
  // ───────────────────────────────────────────────────────────────────────────

  it("4. Over-refund prevention: rejects refund exceeding captured balance with 422", async () => {
    const { payment } = await createCapturedPaymentFixture(160000);

    await expect(
      initiateRefund({
        paymentId: payment._id.toString(),
        amountMinor: 200000, // exceeds 160000
        reason: "BUYER_WITHDRAWAL",
        idempotencyKey: `over-refund-${Date.now()}`,
        requesterUserId: testUser._id.toString(),
      })
    ).rejects.toThrow(/exceeds/i);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Failed Refund Handling & Alerting
  // ───────────────────────────────────────────────────────────────────────────

  it("5. Failed refund alerting: records FAILED status and dispatches REFUND_FAILED notification when provider throws", async () => {
    const { payment } = await createCapturedPaymentFixture(160000);

    // Force adapter to fail refund by using a force-fail key
    const failKey = `force-fail-refund-${Date.now()}`;

    await expect(
      initiateRefund({
        paymentId: payment._id.toString(),
        amountMinor: 160000,
        reason: "BUYER_WITHDRAWAL",
        idempotencyKey: failKey,
        requesterUserId: testUser._id.toString(),
      })
    ).rejects.toThrow(/failed/i);

    // Check Refund record in DB was persisted in FAILED status
    const failedRefund = await Refund.findOne({ idempotencyKey: failKey });
    expect(failedRefund).toBeDefined();
    expect(failedRefund.status).toBe("FAILED");
    expect(failedRefund.failureReason).toBeTruthy();

    // Verify REFUND_FAILED notification dispatched
    const failNotif = await Notification.findOne({
      recipientUserId: testUser._id,
      type: "REFUND_FAILED",
    });
    expect(failNotif).toBeDefined();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Automatic Tier-Drop Savings Refund Calculation
  // ───────────────────────────────────────────────────────────────────────────

  it("6. Automatic tier-drop savings refund: early joiner paying higher initial price receives savings delta refund", async () => {
    const { pool, contribution, payment } = await createCapturedPaymentFixture(160000);

    // Create a locked PriceSnapshot with member share lower than what buyer paid:
    // Buyer initially paid: 160,000 paise (₹1,600)
    // Bulk volume tier price total: 120,000 paise (₹1,200)
    // Savings refund due: 40,000 paise (₹400)
    const PriceSnapshot = mongoose.model("PriceSnapshot");
    const snapshot = await PriceSnapshot.create({
      poolId: pool._id,
      version: 2,
      memberShares: [
        {
          contributionId: contribution._id,
          shopId: testShop._id,
          totalPayableMinor: 120000,
          verifiedSavingsMinor: 40000,
        },
      ],
    });

    const result = await processTierDropSavingsRefunds({
      poolId: pool._id.toString(),
      priceSnapshotId: snapshot._id.toString(),
    });

    expect(result.processedCount).toBe(1);
    expect(result.totalRefundedMinor).toBe(40000);
    expect(result.refunds).toHaveLength(1);

    const tierRefund = result.refunds[0];
    expect(tierRefund.amountMinor).toBe(40000);
    expect(tierRefund.reason).toBe("TIER_PRICE_DROP_SAVINGS");
    expect(tierRefund.status).toBe("COMPLETED");

    // Check Contribution updated with verifiedSavingsMinor and totalRefundedMinor
    const Contribution = mongoose.model("Contribution");
    const updatedContribution = await Contribution.findById(contribution._id);
    expect(updatedContribution.verifiedSavingsMinor).toBe(40000);
    expect(updatedContribution.totalRefundedMinor).toBe(40000);

    // Payment marked PARTIALLY_REFUNDED
    const updatedPayment = await Payment.findById(payment._id);
    expect(updatedPayment.paymentStatus).toBe("PARTIALLY_REFUNDED");

    // Running processTierDropSavingsRefunds again is idempotent (no duplicate refunds)
    const rerun = await processTierDropSavingsRefunds({
      poolId: pool._id.toString(),
      priceSnapshotId: snapshot._id.toString(),
    });
    expect(rerun.processedCount).toBe(0);
    expect(rerun.totalRefundedMinor).toBe(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. HTTP Routes Testing
  // ───────────────────────────────────────────────────────────────────────────

  describe("HTTP Routes: /api/refunds", () => {
    it("POST /api/refunds/initiate creates and processes refund (201)", async () => {
      const { payment } = await createCapturedPaymentFixture(160000);

      const res = await request(testApp)
        .post("/api/refunds/initiate")
        .send({
          paymentId: payment._id.toString(),
          amountMinor: 50000,
          reason: "QUANTITY_REDUCTION",
          idempotencyKey: `http-refund-${Date.now()}`,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.refund.status).toBe("COMPLETED");
      expect(res.body.data.refund.amountMinor).toBe(50000);
    });

    it("GET /api/refunds retrieves paginated shop refunds (200)", async () => {
      const { payment } = await createCapturedPaymentFixture(160000);

      await initiateRefund({
        paymentId: payment._id.toString(),
        amountMinor: 30000,
        reason: "QUANTITY_REDUCTION",
        idempotencyKey: `list-ref-${Date.now()}`,
        requesterUserId: testUser._id.toString(),
      });

      const res = await request(testApp)
        .get("/api/refunds")
        .query({ page: 1, limit: 10 });

      expect(res.status).toBe(200);
      expect(res.body.data.refunds).toBeDefined();
      expect(res.body.data.refunds.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.total).toBeGreaterThanOrEqual(1);
    });

    it("GET /api/refunds/:id retrieves single refund details (200)", async () => {
      const { payment } = await createCapturedPaymentFixture(160000);

      const { refund } = await initiateRefund({
        paymentId: payment._id.toString(),
        amountMinor: 25000,
        reason: "QUANTITY_REDUCTION",
        idempotencyKey: `get-single-ref-${Date.now()}`,
        requesterUserId: testUser._id.toString(),
      });

      const res = await request(testApp).get(`/api/refunds/${refund._id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.refund._id).toBe(refund._id.toString());
      expect(res.body.data.refund.amountMinor).toBe(25000);
    });
  });
});
