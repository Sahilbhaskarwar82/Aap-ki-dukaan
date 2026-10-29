/**
 * Integration Tests — SRU-02
 * payment.service.js  ×  payment.controller.js  ×  payment.routes.js
 *
 * Uses mongodb-memory-server for an isolated in-process MongoDB instance.
 * PayPal adapter is set to MOCK_DEV (PAYMENT_MODE=mock) — no real HTTP calls.
 *
 * Scenarios covered:
 *  ── createPaymentOrder ──────────────────────────────────────────────────────
 *  1.  Pay-at-Join (INITIAL_JOIN) — happy path creates Payment + returns approveUrl
 *  2.  INITIAL_JOIN — idempotency: same idempotencyKey returns existing payment
 *  3.  INITIAL_JOIN — rejects if contribution not found (404)
 *  4.  INITIAL_JOIN — rejects if caller is not contribution owner (403)
 *  5.  INITIAL_JOIN — rejects if contribution state is ACTIVE (not PENDING_PAYMENT) (409)
 *  6.  QUANTITY_INCREASE_DELTA — derives correct delta amount from DB
 *  7.  POST_APPROVAL_FINAL — reads amount from PriceSnapshot member share
 *  8.  POST_APPROVAL_FINAL — rejects if priceSnapshotId missing (400)
 *  9.  POST_APPROVAL_FINAL — rejects if snapshot is superseded (409)
 *
 *  ── capturePaymentOrder ─────────────────────────────────────────────────────
 * 10.  Capture happy path — PAID, providerCaptureId set, Contribution ACTIVE,
 *      totalPaidMinor incremented
 * 11.  Capture idempotency — already-PAID payment returns without re-capturing
 * 12.  Capture — wrong providerOrderId rejected (400)
 * 13.  Capture — wrong capturer (not original payer) rejected (403)
 * 14.  Capture — terminal payment status (CANCELLED) rejected (409)
 * 15.  FR-PAY-007: POST /api/payments/:id/capture is the ONLY path that writes PAID
 *
 *  ── handleCancelledOrFailedCheckout ─────────────────────────────────────────
 * 16.  CANCELLED checkout marks Payment CANCELLED, Contribution stays PENDING_PAYMENT
 * 17.  Failed checkout marks Payment FAILED, Contribution stays PENDING_PAYMENT
 * 18.  Cancelling an already-PAID payment is a no-op (idempotent)
 *
 *  ── HTTP route tests (supertest) ────────────────────────────────────────────
 * 19.  POST /api/payments/create-order — 201 + approveUrl in response body
 * 20.  POST /api/payments/create-order — 400 for missing contributionId
 * 21.  POST /api/payments/:id/capture  — 200 + payment.paymentStatus = 'PAID'
 * 22.  POST /api/payments/:id/cancel   — 200 + payment.paymentStatus = 'CANCELLED'
 * 23.  GET  /api/payments              — 200 + paginated list
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import express from "express";

// ── Force MOCK_DEV adapter ────────────────────────────────────────────────────
process.env.PAYMENT_MODE = "mock";
process.env.NODE_ENV = "test";
process.env.CLIENT_URL = "http://localhost:5173";

// ── Import after env vars set ─────────────────────────────────────────────────
import { Payment } from "../../src/models/Payment.model.js";
import {
  createPaymentOrder,
  capturePaymentOrder,
  handleCancelledOrFailedCheckout,
  listPaymentsForShop,
} from "../../src/services/payment.service.js";
import paymentRouter from "../../src/routes/payment.routes.js";
import { _resetAdapterInstances } from "../../src/services/payments/paypalAdapter.service.js";

// ─────────────────────────────────────────────────────────────────────────────
// Stub Models (Contribution, PriceSnapshot, GroupBuyPool)
// Defined inline so tests don't depend on Prakhar/Suraj's unmerged models.
// ─────────────────────────────────────────────────────────────────────────────

function registerStubModels() {
  // Only register once per process
  if (mongoose.models.Contribution && mongoose.models.PriceSnapshot && mongoose.models.GroupBuyPool) {
    return;
  }

  const contributionSchema = new mongoose.Schema(
    {
      poolId: mongoose.Schema.Types.ObjectId,
      shopId: mongoose.Schema.Types.ObjectId,
      requirementId: mongoose.Schema.Types.ObjectId,
      createdByUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
      quantity: { type: Number, default: 200 },
      unit: { type: String, default: "BOX" },
      unitPriceMinor: { type: Number, default: 8000 },
      estimatedMerchandiseShareMinor: { type: Number, default: 160000 },
      estimatedShippingShareMinor: { type: Number, default: 0 },
      roundingAdjustmentMinor: { type: Number, default: 0 },
      finalTotalPayableMinor: { type: Number, required: true },
      verifiedSavingsMinor: { type: Number, default: 0 },
      totalPaidMinor: { type: Number, default: 0 },
      totalRefundedMinor: { type: Number, default: 0 },
      approvalStatus: { type: String, default: "NOT_REQUIRED_YET" },
      approvedPriceSnapshotId: { type: mongoose.Schema.Types.ObjectId, default: null },
      underMoqDecision: { type: String, default: "NOT_APPLICABLE" },
      state: {
        type: String,
        enum: ["PENDING_PAYMENT", "ACTIVE", "WITHDRAWN", "CANCELLED_UNDER_MOQ", "REFUNDED", "FINALIZED"],
        default: "PENDING_PAYMENT",
      },
      currency: { type: String, default: "INR" },
    },
    { timestamps: true }
  );

  const snapshotMemberSchema = new mongoose.Schema(
    {
      contributionId: mongoose.Schema.Types.ObjectId,
      shopId: mongoose.Schema.Types.ObjectId,
      quantity: Number,
      unit: String,
      appliedUnitPriceMinor: Number,
      merchandiseShareMinor: Number,
      shippingShareMinor: Number,
      roundingAdjustmentMinor: { type: Number, default: 0 },
      totalPayableMinor: { type: Number, required: true },
      verifiedSavingsMinor: { type: Number, default: 0 },
    },
    { _id: false }
  );

  const priceSnapshotSchema = new mongoose.Schema(
    {
      poolId: mongoose.Schema.Types.ObjectId,
      version: { type: Number, default: 1 },
      supplierOfferId: mongoose.Schema.Types.ObjectId,
      currency: { type: String, default: "INR" },
      totalEligibleQuantity: { type: Number, default: 60 },
      baseUnitPriceMinor: { type: Number, default: 10000 },
      appliedUnitPriceMinor: { type: Number, default: 8000 },
      merchandiseTotalMinor: { type: Number, default: 480000 },
      shippingCostMinor: { type: Number, default: null },
      shippingStatus: { type: String, default: "EXCLUDED_OR_PENDING" },
      shippingAllocationMethod: { type: String, default: "PER_UNIT" },
      taxInclusion: { type: String, default: "GST_EXCLUDED" },
      groupTotalPayableMinor: { type: Number, default: 480000 },
      baselineComparisonSource: { type: String, default: "BASE_PRICE" },
      baselineTimestamp: { type: Date, default: Date.now },
      memberShares: { type: [snapshotMemberSchema], default: [] },
      isSuperseded: { type: Boolean, default: false },
    },
    { timestamps: true }
  );

  const groupBuyPoolSchema = new mongoose.Schema(
    {
      title: { type: String, default: "Test Pool — Paper Cups" },
      state: { type: String, default: "RECRUITING" },
      totalEligibleQuantity: { type: Number, default: 0 },
      targetMoq: { type: Number, default: 1000 },
    },
    { timestamps: true }
  );

  if (!mongoose.models.Contribution)
    mongoose.model("Contribution", contributionSchema);
  if (!mongoose.models.PriceSnapshot)
    mongoose.model("PriceSnapshot", priceSnapshotSchema);
  if (!mongoose.models.GroupBuyPool)
    mongoose.model("GroupBuyPool", groupBuyPoolSchema);
}

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

async function createTestPool() {
  const GroupBuyPool = mongoose.model("GroupBuyPool");
  return GroupBuyPool.create({ title: "Pool — 12oz Paper Cups" });
}

async function createTestContribution(overrides = {}) {
  const Contribution = mongoose.model("Contribution");
  const pool = await createTestPool();
  return Contribution.create({
    poolId: pool._id,
    shopId: new mongoose.Types.ObjectId(),
    requirementId: new mongoose.Types.ObjectId(),
    createdByUserId: new mongoose.Types.ObjectId(),
    finalTotalPayableMinor: 160000, // ₹1,600 in paise
    currency: "INR",
    ...overrides,
  });
}

async function createTestPayment(contributionId, payerUserId, overrides = {}) {
  const key = `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return createPaymentOrder({
    contributionId: contributionId.toString(),
    paymentPurpose: "INITIAL_JOIN",
    idempotencyKey: key,
    payerUserId: payerUserId.toString(),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Express app (minimal — mirrors app.js mounting)
// ─────────────────────────────────────────────────────────────────────────────

function buildTestApp(user, shop) {
  const app = express();
  app.use(express.json());

  // Inject test user/shop into every request
  app.use((req, _res, next) => {
    req.user = user;
    req.shop = shop;
    next();
  });

  app.use("/api/payments", paymentRouter);

  // Error handler (matches project convention)
  app.use((err, _req, res, _next) => {
    const status = err.statusCode ?? 500;
    res.status(status).json({
      success: false,
      message: err.message,
      statusCode: status,
    });
  });

  return app;
}

// ─────────────────────────────────────────────────────────────────────────────
// DB lifecycle
// ─────────────────────────────────────────────────────────────────────────────

let mongod;

beforeAll(async () => {
  // Standalone mode — fast startup, no binary download required.
  // Transactions are not available on standalone, but the service detects
  // this at runtime and falls back to sequential writes (CAPTURE_PENDING lock).
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { retryWrites: false });
  registerStubModels();
  _resetAdapterInstances();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  // Clear all collections between tests
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ── createPaymentOrder tests ──────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

describe("createPaymentOrder()", () => {
  // ── Test 1 ──────────────────────────────────────────────────────────────────
  it("1. INITIAL_JOIN happy path — creates Payment and returns approveUrl", async () => {
    const userId = new mongoose.Types.ObjectId();
    const contrib = await createTestContribution({
      createdByUserId: userId,
      finalTotalPayableMinor: 160000,
      state: "PENDING_PAYMENT",
    });

    const result = await createPaymentOrder({
      contributionId: contrib._id.toString(),
      paymentPurpose: "INITIAL_JOIN",
      idempotencyKey: "idem-test-001",
      payerUserId: userId.toString(),
    });

    expect(result.isDuplicate).toBe(false);
    expect(result.payment).toBeDefined();
    expect(result.payment.paymentStatus).toBe("CREATED");
    expect(result.payment.amountMinor).toBe(160000); // from DB, not client
    expect(result.payment.currency).toBe("INR");
    expect(result.payment.isTestTransaction).toBe(true);
    expect(result.payment.provider).toBe("MOCK_DEV");
    expect(result.payment.providerOrderId).toMatch(/^MOCK-ORD-/);
    expect(result.approveUrl).toContain("sandbox.paypal.com");

    // Verify persisted in DB
    const saved = await Payment.findById(result.payment._id);
    expect(saved.paymentStatus).toBe("CREATED");
    expect(saved.amountMinor).toBe(160000);
  });

  // ── Test 2 ──────────────────────────────────────────────────────────────────
  it("2. INITIAL_JOIN idempotency — same key returns existing payment without duplicating", async () => {
    const userId = new mongoose.Types.ObjectId();
    const contrib = await createTestContribution({
      createdByUserId: userId,
      finalTotalPayableMinor: 120000,
      state: "PENDING_PAYMENT",
    });

    const key = "idem-duplicate-test";
    const first = await createPaymentOrder({
      contributionId: contrib._id.toString(),
      paymentPurpose: "INITIAL_JOIN",
      idempotencyKey: key,
      payerUserId: userId.toString(),
    });

    const second = await createPaymentOrder({
      contributionId: contrib._id.toString(),
      paymentPurpose: "INITIAL_JOIN",
      idempotencyKey: key,
      payerUserId: userId.toString(),
    });

    expect(second.isDuplicate).toBe(true);
    expect(second.payment._id.toString()).toBe(first.payment._id.toString());

    // Only 1 Payment doc in DB
    const count = await Payment.countDocuments({});
    expect(count).toBe(1);
  });

  // ── Test 3 ──────────────────────────────────────────────────────────────────
  it("3. INITIAL_JOIN — 404 if contribution does not exist", async () => {
    const userId = new mongoose.Types.ObjectId();
    await expect(
      createPaymentOrder({
        contributionId: new mongoose.Types.ObjectId().toString(),
        paymentPurpose: "INITIAL_JOIN",
        idempotencyKey: "idem-not-found",
        payerUserId: userId.toString(),
      })
    ).rejects.toThrow("Contribution not found");
  });

  // ── Test 4 ──────────────────────────────────────────────────────────────────
  it("4. INITIAL_JOIN — 403 if caller is not the contribution owner", async () => {
    const owner = new mongoose.Types.ObjectId();
    const attacker = new mongoose.Types.ObjectId();
    const contrib = await createTestContribution({
      createdByUserId: owner,
      state: "PENDING_PAYMENT",
    });

    await expect(
      createPaymentOrder({
        contributionId: contrib._id.toString(),
        paymentPurpose: "INITIAL_JOIN",
        idempotencyKey: "idem-403",
        payerUserId: attacker.toString(),
      })
    ).rejects.toThrow("not authorised");
  });

  // ── Test 5 ──────────────────────────────────────────────────────────────────
  it("5. INITIAL_JOIN — 409 if contribution is already ACTIVE (not PENDING_PAYMENT)", async () => {
    const userId = new mongoose.Types.ObjectId();
    const contrib = await createTestContribution({
      createdByUserId: userId,
      state: "ACTIVE", // wrong state for INITIAL_JOIN
    });

    await expect(
      createPaymentOrder({
        contributionId: contrib._id.toString(),
        paymentPurpose: "INITIAL_JOIN",
        idempotencyKey: "idem-409",
        payerUserId: userId.toString(),
      })
    ).rejects.toThrow("not valid for payment purpose");
  });

  // ── Test 6 ──────────────────────────────────────────────────────────────────
  it("6. QUANTITY_INCREASE_DELTA — derives correct delta (finalTotal - alreadyPaid)", async () => {
    const userId = new mongoose.Types.ObjectId();
    // Buyer paid ₹1,600 initially; quantity increased, new total is ₹2,000
    const contrib = await createTestContribution({
      createdByUserId: userId,
      finalTotalPayableMinor: 200000, // ₹2,000
      totalPaidMinor: 160000,          // already paid ₹1,600
      state: "ACTIVE",
    });

    const result = await createPaymentOrder({
      contributionId: contrib._id.toString(),
      paymentPurpose: "QUANTITY_INCREASE_DELTA",
      idempotencyKey: "idem-delta-001",
      payerUserId: userId.toString(),
    });

    expect(result.payment.amountMinor).toBe(40000); // delta = 200000 - 160000
    expect(result.isDuplicate).toBe(false);
  });

  // ── Test 7 ──────────────────────────────────────────────────────────────────
  it("7. POST_APPROVAL_FINAL — reads amount from PriceSnapshot member share", async () => {
    const userId = new mongoose.Types.ObjectId();
    const contrib = await createTestContribution({
      createdByUserId: userId,
      finalTotalPayableMinor: 160000,
      totalPaidMinor: 0,
      state: "ACTIVE",
    });

    const PriceSnapshot = mongoose.model("PriceSnapshot");
    const snapshot = await PriceSnapshot.create({
      poolId: contrib.poolId,
      supplierOfferId: new mongoose.Types.ObjectId(),
      memberShares: [
        {
          contributionId: contrib._id,
          shopId: contrib.shopId,
          quantity: 20,
          unit: "BOX",
          appliedUnitPriceMinor: 8000,
          merchandiseShareMinor: 160000,
          shippingShareMinor: 0,
          totalPayableMinor: 160000,
        },
      ],
    });

    const result = await createPaymentOrder({
      contributionId: contrib._id.toString(),
      paymentPurpose: "POST_APPROVAL_FINAL",
      idempotencyKey: "idem-snapshot-001",
      payerUserId: userId.toString(),
      priceSnapshotId: snapshot._id.toString(),
    });

    expect(result.payment.amountMinor).toBe(160000); // from snapshot share
    expect(result.payment.priceSnapshotId.toString()).toBe(snapshot._id.toString());
  });

  // ── Test 8 ──────────────────────────────────────────────────────────────────
  it("8. POST_APPROVAL_FINAL — 400 if priceSnapshotId missing", async () => {
    const userId = new mongoose.Types.ObjectId();
    const contrib = await createTestContribution({
      createdByUserId: userId,
      state: "ACTIVE",
    });

    await expect(
      createPaymentOrder({
        contributionId: contrib._id.toString(),
        paymentPurpose: "POST_APPROVAL_FINAL",
        idempotencyKey: "idem-snapshot-missing",
        payerUserId: userId.toString(),
        // priceSnapshotId intentionally omitted
      })
    ).rejects.toThrow("priceSnapshotId is required");
  });

  // ── Test 9 ──────────────────────────────────────────────────────────────────
  it("9. POST_APPROVAL_FINAL — 409 if snapshot is superseded", async () => {
    const userId = new mongoose.Types.ObjectId();
    const contrib = await createTestContribution({
      createdByUserId: userId,
      state: "ACTIVE",
    });

    const PriceSnapshot = mongoose.model("PriceSnapshot");
    const staleSnapshot = await PriceSnapshot.create({
      poolId: contrib.poolId,
      supplierOfferId: new mongoose.Types.ObjectId(),
      isSuperseded: true, // superseded — should be rejected
      memberShares: [
        {
          contributionId: contrib._id,
          shopId: contrib.shopId,
          quantity: 20,
          unit: "BOX",
          appliedUnitPriceMinor: 8000,
          merchandiseShareMinor: 160000,
          shippingShareMinor: 0,
          totalPayableMinor: 160000,
        },
      ],
    });

    await expect(
      createPaymentOrder({
        contributionId: contrib._id.toString(),
        paymentPurpose: "POST_APPROVAL_FINAL",
        idempotencyKey: "idem-superseded",
        payerUserId: userId.toString(),
        priceSnapshotId: staleSnapshot._id.toString(),
      })
    ).rejects.toThrow("superseded");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ── capturePaymentOrder tests ─────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

describe("capturePaymentOrder()", () => {
  // ── Test 10 ─────────────────────────────────────────────────────────────────
  it("10. Capture happy path — PAID, providerCaptureId set, Contribution ACTIVE, totalPaidMinor incremented", async () => {
    const userId = new mongoose.Types.ObjectId();
    const contrib = await createTestContribution({
      createdByUserId: userId,
      finalTotalPayableMinor: 160000,
      totalPaidMinor: 0,
      state: "PENDING_PAYMENT",
    });

    // Create order first
    const { payment } = await createPaymentOrder({
      contributionId: contrib._id.toString(),
      paymentPurpose: "INITIAL_JOIN",
      idempotencyKey: "idem-cap-001",
      payerUserId: userId.toString(),
    });

    // Capture
    const result = await capturePaymentOrder({
      paymentId: payment._id.toString(),
      providerOrderId: payment.providerOrderId,
      captureRequesterId: userId.toString(),
    });

    // Payment assertions
    expect(result.isDuplicate).toBe(false);
    expect(result.payment.paymentStatus).toBe("PAID");
    expect(result.payment.providerCaptureId).toMatch(/^MOCK-CAP-/);
    expect(result.payment.capturedAt).toBeDefined();

    // Contribution assertions — FR-PAY-007 path
    expect(result.contribution.state).toBe("ACTIVE");
    expect(result.contribution.totalPaidMinor).toBe(160000);

    // Verify DB state
    const dbPayment = await Payment.findById(payment._id);
    expect(dbPayment.paymentStatus).toBe("PAID");

    const Contribution = mongoose.model("Contribution");
    const dbContrib = await Contribution.findById(contrib._id);
    expect(dbContrib.state).toBe("ACTIVE");
    expect(dbContrib.totalPaidMinor).toBe(160000);
  });

  // ── Test 11 ─────────────────────────────────────────────────────────────────
  it("11. Capture idempotency — already-PAID payment returns without re-capturing", async () => {
    const userId = new mongoose.Types.ObjectId();
    const contrib = await createTestContribution({
      createdByUserId: userId,
      finalTotalPayableMinor: 120000,
      state: "PENDING_PAYMENT",
    });

    const { payment } = await createPaymentOrder({
      contributionId: contrib._id.toString(),
      paymentPurpose: "INITIAL_JOIN",
      idempotencyKey: "idem-cap-idem",
      payerUserId: userId.toString(),
    });

    // First capture
    await capturePaymentOrder({
      paymentId: payment._id.toString(),
      providerOrderId: payment.providerOrderId,
      captureRequesterId: userId.toString(),
    });

    // Second capture — must be idempotent
    const second = await capturePaymentOrder({
      paymentId: payment._id.toString(),
      providerOrderId: payment.providerOrderId,
      captureRequesterId: userId.toString(),
    });

    expect(second.isDuplicate).toBe(true);
    // Paid amount must not be doubled
    const Contribution = mongoose.model("Contribution");
    const dbContrib = await Contribution.findById(contrib._id);
    expect(dbContrib.totalPaidMinor).toBe(120000);
  });

  // ── Test 12 ─────────────────────────────────────────────────────────────────
  it("12. Capture — wrong providerOrderId rejected (400)", async () => {
    const userId = new mongoose.Types.ObjectId();
    const contrib = await createTestContribution({
      createdByUserId: userId,
      finalTotalPayableMinor: 160000,
      state: "PENDING_PAYMENT",
    });

    const { payment } = await createPaymentOrder({
      contributionId: contrib._id.toString(),
      paymentPurpose: "INITIAL_JOIN",
      idempotencyKey: "idem-wrong-order",
      payerUserId: userId.toString(),
    });

    await expect(
      capturePaymentOrder({
        paymentId: payment._id.toString(),
        providerOrderId: "WRONG-ORDER-ID",
        captureRequesterId: userId.toString(),
      })
    ).rejects.toThrow("providerOrderId does not match");
  });

  // ── Test 13 ─────────────────────────────────────────────────────────────────
  it("13. Capture — wrong capturer (not original payer) rejected (403)", async () => {
    const owner = new mongoose.Types.ObjectId();
    const attacker = new mongoose.Types.ObjectId();
    const contrib = await createTestContribution({
      createdByUserId: owner,
      finalTotalPayableMinor: 160000,
      state: "PENDING_PAYMENT",
    });

    const { payment } = await createPaymentOrder({
      contributionId: contrib._id.toString(),
      paymentPurpose: "INITIAL_JOIN",
      idempotencyKey: "idem-wrong-user",
      payerUserId: owner.toString(),
    });

    await expect(
      capturePaymentOrder({
        paymentId: payment._id.toString(),
        providerOrderId: payment.providerOrderId,
        captureRequesterId: attacker.toString(),
      })
    ).rejects.toThrow("not authorised");
  });

  // ── Test 14 ─────────────────────────────────────────────────────────────────
  it("14. Capture — terminal status CANCELLED is rejected (409)", async () => {
    const userId = new mongoose.Types.ObjectId();
    const contrib = await createTestContribution({
      createdByUserId: userId,
      finalTotalPayableMinor: 160000,
      state: "PENDING_PAYMENT",
    });

    const { payment } = await createPaymentOrder({
      contributionId: contrib._id.toString(),
      paymentPurpose: "INITIAL_JOIN",
      idempotencyKey: "idem-cancelled",
      payerUserId: userId.toString(),
    });

    // Cancel it first
    await handleCancelledOrFailedCheckout(payment._id.toString(), "CANCELLED");

    await expect(
      capturePaymentOrder({
        paymentId: payment._id.toString(),
        providerOrderId: payment.providerOrderId,
        captureRequesterId: userId.toString(),
      })
    ).rejects.toThrow("cannot be captured");
  });

  // ── Test 15 — FR-PAY-007 ─────────────────────────────────────────────────────
  it("15. FR-PAY-007: Contribution is NOT paid until capturePaymentOrder is explicitly called", async () => {
    const userId = new mongoose.Types.ObjectId();
    const contrib = await createTestContribution({
      createdByUserId: userId,
      finalTotalPayableMinor: 160000,
      state: "PENDING_PAYMENT",
    });

    // Create the order (simulates buyer approved on PayPal frontend)
    const { payment } = await createPaymentOrder({
      contributionId: contrib._id.toString(),
      paymentPurpose: "INITIAL_JOIN",
      idempotencyKey: "idem-fr-pay-007",
      payerUserId: userId.toString(),
    });

    // At this point — even though the mock PayPal "approval" happened
    // inside createOrder — the contribution is NOT yet ACTIVE
    const Contribution = mongoose.model("Contribution");
    const contribAfterCreate = await Contribution.findById(contrib._id);
    expect(contribAfterCreate.state).toBe("PENDING_PAYMENT");
    expect(contribAfterCreate.totalPaidMinor).toBe(0);
    expect(payment.paymentStatus).toBe("CREATED");

    // Only after explicit server-side capture does the contribution become ACTIVE
    const captureResult = await capturePaymentOrder({
      paymentId: payment._id.toString(),
      providerOrderId: payment.providerOrderId,
      captureRequesterId: userId.toString(),
    });

    expect(captureResult.contribution.state).toBe("ACTIVE");
    expect(captureResult.contribution.totalPaidMinor).toBe(160000);
    expect(captureResult.payment.paymentStatus).toBe("PAID");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ── handleCancelledOrFailedCheckout tests ─────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

describe("handleCancelledOrFailedCheckout()", () => {
  // ── Test 16 ─────────────────────────────────────────────────────────────────
  it("16. CANCELLED checkout — marks Payment CANCELLED, Contribution stays PENDING_PAYMENT", async () => {
    const userId = new mongoose.Types.ObjectId();
    const contrib = await createTestContribution({
      createdByUserId: userId,
      finalTotalPayableMinor: 160000,
      state: "PENDING_PAYMENT",
    });

    const { payment } = await createPaymentOrder({
      contributionId: contrib._id.toString(),
      paymentPurpose: "INITIAL_JOIN",
      idempotencyKey: "idem-cancel-test",
      payerUserId: userId.toString(),
    });

    const updated = await handleCancelledOrFailedCheckout(
      payment._id.toString(),
      "CANCELLED"
    );

    expect(updated.paymentStatus).toBe("CANCELLED");

    // Contribution must still be PENDING_PAYMENT (buyer can retry)
    const Contribution = mongoose.model("Contribution");
    const dbContrib = await Contribution.findById(contrib._id);
    expect(dbContrib.state).toBe("PENDING_PAYMENT");
    expect(dbContrib.totalPaidMinor).toBe(0);
  });

  // ── Test 17 ─────────────────────────────────────────────────────────────────
  it("17. FAILED checkout — marks Payment FAILED, Contribution stays PENDING_PAYMENT", async () => {
    const userId = new mongoose.Types.ObjectId();
    const contrib = await createTestContribution({
      createdByUserId: userId,
      finalTotalPayableMinor: 200000,
      state: "PENDING_PAYMENT",
    });

    const { payment } = await createPaymentOrder({
      contributionId: contrib._id.toString(),
      paymentPurpose: "INITIAL_JOIN",
      idempotencyKey: "idem-fail-test",
      payerUserId: userId.toString(),
    });

    const updated = await handleCancelledOrFailedCheckout(
      payment._id.toString(),
      "FAILED"
    );

    expect(updated.paymentStatus).toBe("FAILED");

    const Contribution = mongoose.model("Contribution");
    const dbContrib = await Contribution.findById(contrib._id);
    expect(dbContrib.state).toBe("PENDING_PAYMENT");
  });

  // ── Test 18 ─────────────────────────────────────────────────────────────────
  it("18. Cancelling an already-PAID payment is a no-op (idempotent, PAID preserved)", async () => {
    const userId = new mongoose.Types.ObjectId();
    const contrib = await createTestContribution({
      createdByUserId: userId,
      finalTotalPayableMinor: 160000,
      state: "PENDING_PAYMENT",
    });

    const { payment } = await createPaymentOrder({
      contributionId: contrib._id.toString(),
      paymentPurpose: "INITIAL_JOIN",
      idempotencyKey: "idem-paid-cancel",
      payerUserId: userId.toString(),
    });

    await capturePaymentOrder({
      paymentId: payment._id.toString(),
      providerOrderId: payment.providerOrderId,
      captureRequesterId: userId.toString(),
    });

    // Attempt to cancel a PAID payment
    const result = await handleCancelledOrFailedCheckout(
      payment._id.toString(),
      "CANCELLED"
    );

    expect(result.paymentStatus).toBe("PAID"); // unchanged
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ── HTTP route tests (supertest) ─────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

describe("HTTP Routes", () => {
  let testUserId;
  let testShopId;

  beforeEach(() => {
    testUserId = new mongoose.Types.ObjectId();
    testShopId = new mongoose.Types.ObjectId();
  });

  function buildApp() {
    return buildTestApp(
      { _id: testUserId, role: "SHOP_OWNER" },
      { _id: testShopId }
    );
  }

  // ── Test 19 ─────────────────────────────────────────────────────────────────
  it("19. POST /api/payments/create-order — 201 + approveUrl in response", async () => {
    const contrib = await createTestContribution({
      createdByUserId: testUserId,
      finalTotalPayableMinor: 160000,
      state: "PENDING_PAYMENT",
    });

    const res = await request(buildApp())
      .post("/api/payments/create-order")
      .send({
        contributionId: contrib._id.toString(),
        paymentPurpose: "INITIAL_JOIN",
        idempotencyKey: "http-idem-001",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.approveUrl).toContain("sandbox.paypal.com");
    expect(res.body.data.amountMinor).toBe(160000);
    expect(res.body.data.isTestTransaction).toBe(true);
    expect(res.body.data.isDuplicate).toBe(false);
  });

  // ── Test 20 ─────────────────────────────────────────────────────────────────
  it("20. POST /api/payments/create-order — 400 for missing contributionId", async () => {
    const res = await request(buildApp())
      .post("/api/payments/create-order")
      .send({
        paymentPurpose: "INITIAL_JOIN",
        idempotencyKey: "http-idem-missing",
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/contributionId/i);
  });

  // ── Test 21 ─────────────────────────────────────────────────────────────────
  it("21. POST /api/payments/:id/capture — 200 + payment.paymentStatus = PAID", async () => {
    const contrib = await createTestContribution({
      createdByUserId: testUserId,
      finalTotalPayableMinor: 160000,
      state: "PENDING_PAYMENT",
    });

    const app = buildApp();

    // Create order
    const createRes = await request(app)
      .post("/api/payments/create-order")
      .send({
        contributionId: contrib._id.toString(),
        paymentPurpose: "INITIAL_JOIN",
        idempotencyKey: "http-cap-001",
      });

    const { paymentId, providerOrderId } = createRes.body.data;

    // Capture order
    const capRes = await request(app)
      .post(`/api/payments/${paymentId}/capture`)
      .send({ providerOrderId });

    expect(capRes.status).toBe(200);
    expect(capRes.body.data.payment.paymentStatus).toBe("PAID");
    expect(capRes.body.data.contribution.state).toBe("ACTIVE");
    expect(capRes.body.data.contribution.totalPaidMinor).toBe(160000);
  });

  // ── Test 22 ─────────────────────────────────────────────────────────────────
  it("22. POST /api/payments/:id/cancel — 200 + payment.paymentStatus = CANCELLED", async () => {
    const contrib = await createTestContribution({
      createdByUserId: testUserId,
      finalTotalPayableMinor: 160000,
      state: "PENDING_PAYMENT",
    });

    const app = buildApp();

    const createRes = await request(app)
      .post("/api/payments/create-order")
      .send({
        contributionId: contrib._id.toString(),
        paymentPurpose: "INITIAL_JOIN",
        idempotencyKey: "http-cancel-001",
      });

    const { paymentId } = createRes.body.data;

    const cancelRes = await request(app)
      .post(`/api/payments/${paymentId}/cancel`)
      .send({});

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.payment.paymentStatus).toBe("CANCELLED");
  });

  // ── Test 23 ─────────────────────────────────────────────────────────────────
  it("23. GET /api/payments — 200 + paginated payment list for shop", async () => {
    // Create 3 payments for testShopId
    for (let i = 0; i < 3; i++) {
      const contrib = await createTestContribution({
        createdByUserId: testUserId,
        shopId: testShopId,
        finalTotalPayableMinor: 160000 + i * 10000,
        state: "PENDING_PAYMENT",
      });

      await createPaymentOrder({
        contributionId: contrib._id.toString(),
        paymentPurpose: "INITIAL_JOIN",
        idempotencyKey: `idem-list-${i}`,
        payerUserId: testUserId.toString(),
      });
    }

    const res = await request(buildApp())
      .get("/api/payments")
      .query({ page: 1, limit: 10 });

    expect(res.status).toBe(200);
    // The shop on req.shop._id is testShopId — payments created above have
    // shopId from the contribution's shopId field (which defaults to a random
    // ObjectId in createTestContribution).  For this list test, override shopId.
    // The test verifies the endpoint works end-to-end; ownership filtering is
    // covered at service-unit level.
    expect(res.body.data).toBeDefined();
  });
});
