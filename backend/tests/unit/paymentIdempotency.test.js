/**
 * Unit Tests — SRU-01
 * paypalAdapter.service.js
 *
 * Covers:
 *  1. toDecimalString / toMinorUnits helper math
 *  2. MockDevAdapter — createOrder, captureOrder, refundCapture, isolation
 *  3. PayPalSandboxAdapter — OAuth token caching logic (fetch mocked)
 *  4. getPayPalAdapter() factory — returns correct adapter per PAYMENT_MODE
 *  5. _resetAdapterInstances() allows test re-init
 *
 * Run: npx vitest run tests/unit/paymentIdempotency.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import express from "express";
import request from "supertest";

import {
  getPayPalAdapter,
  _resetAdapterInstances,
  MockDevAdapter,
  PayPalSandboxAdapter,
  toDecimalString,
  toMinorUnits,
} from "../../src/services/payments/paypalAdapter.service.js";
import { Payment } from "../../src/models/Payment.model.js";
import {
  createPaymentOrder,
  capturePaymentOrder,
  verifyWebhookSignature,
  handlePayPalWebhook,
  reconcilePaymentState,
} from "../../src/services/payments/payment.service.js";
import paymentRouter from "../../src/routes/payment.routes.js";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Monetary conversion helpers
// ─────────────────────────────────────────────────────────────────────────────

describe("toDecimalString()", () => {
  it("converts paise to INR decimal string", () => {
    expect(toDecimalString(480000, "INR")).toBe("4800.00");
  });

  it("converts cents to USD decimal string", () => {
    expect(toDecimalString(4800, "USD")).toBe("48.00");
  });

  it("handles 1 paise correctly", () => {
    expect(toDecimalString(1, "INR")).toBe("0.01");
  });

  it("handles round numbers", () => {
    expect(toDecimalString(100000, "INR")).toBe("1000.00");
  });

  it("mandatory ₹4,800 calculation from LLD §4.2", () => {
    // 60 boxes × ₹80/box = ₹4,800 = 480000 paise
    const merchandiseTotalMinor = 60 * 8000;
    expect(merchandiseTotalMinor).toBe(480000);
    expect(toDecimalString(merchandiseTotalMinor, "INR")).toBe("4800.00");
  });
});

describe("toMinorUnits()", () => {
  it("converts INR decimal string to paise", () => {
    expect(toMinorUnits("4800.00", "INR")).toBe(480000);
  });

  it("converts USD decimal string to cents", () => {
    expect(toMinorUnits("48.00", "USD")).toBe(4800);
  });

  it("round-trips cleanly with toDecimalString", () => {
    const original = 123456;
    expect(toMinorUnits(toDecimalString(original, "INR"), "INR")).toBe(original);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. MockDevAdapter
// ─────────────────────────────────────────────────────────────────────────────

describe("MockDevAdapter", () => {
  let adapter;

  beforeEach(() => {
    adapter = new MockDevAdapter();
  });

  // 2a. createOrder
  describe("createOrder()", () => {
    it("returns a MOCK-ORD- prefixed providerOrderId", async () => {
      const result = await adapter.createOrder({
        amountMinor: 160000,
        currency: "INR",
        idempotencyKey: "test-idem-001",
      });

      expect(result.providerOrderId).toMatch(/^MOCK-ORD-/);
      expect(result.status).toBe("CREATED");
      expect(result.approveUrl).toContain("sandbox.paypal.com");
      expect(result._isMock).toBe(true);
    });

    it("generates different order IDs on successive calls", async () => {
      const r1 = await adapter.createOrder({ amountMinor: 1000, currency: "INR", idempotencyKey: "k1" });
      const r2 = await adapter.createOrder({ amountMinor: 1000, currency: "INR", idempotencyKey: "k2" });
      expect(r1.providerOrderId).not.toBe(r2.providerOrderId);
    });
  });

  // 2b. captureOrder
  describe("captureOrder()", () => {
    it("returns COMPLETED captureStatus and a MOCK-CAP- prefixed captureId", async () => {
      const { providerOrderId } = await adapter.createOrder({
        amountMinor: 200000,
        currency: "INR",
        idempotencyKey: "test-idem-002",
      });

      const capture = await adapter.captureOrder(providerOrderId, "test-idem-002");

      expect(capture.captureStatus).toBe("COMPLETED");
      expect(capture.providerCaptureId).toMatch(/^MOCK-CAP-/);
      expect(capture.rawResponse._isMock).toBe(true);
    });

    it("throws if providerOrderId does not start with MOCK-ORD-", async () => {
      await expect(
        adapter.captureOrder("REAL-PayPal-ID", "idem-003")
      ).rejects.toThrow("unexpected providerOrderId format");
    });
  });

  // 2c. refundCapture
  describe("refundCapture()", () => {
    it("returns COMPLETED refundStatus and a MOCK-REF- prefixed refundId", async () => {
      const { providerOrderId } = await adapter.createOrder({
        amountMinor: 120000,
        currency: "INR",
        idempotencyKey: "test-idem-004",
      });
      const { providerCaptureId } = await adapter.captureOrder(providerOrderId, "test-idem-004");

      const refund = await adapter.refundCapture({
        providerCaptureId,
        amountMinor: 120000,
        currency: "INR",
        idempotencyKey: "refund-idem-004",
        reason: "BUYER_WITHDRAWAL",
      });

      expect(refund.refundStatus).toBe("COMPLETED");
      expect(refund.providerRefundId).toMatch(/^MOCK-REF-/);
      expect(refund.amountMinor).toBe(120000);
      expect(refund.rawResponse._isMock).toBe(true);
    });

    it("preserves the amountMinor passed in for full refund", async () => {
      const amount = 200000;
      const result = await adapter.refundCapture({
        providerCaptureId: "MOCK-CAP-xyz",
        amountMinor: amount,
        currency: "INR",
        idempotencyKey: "refund-idem-005",
        reason: "POOL_CANCELLED",
      });
      expect(result.amountMinor).toBe(amount);
    });
  });

  // 2d. Isolation — mock adapter never makes real HTTP calls
  it("MockDevAdapter never calls fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const a = new MockDevAdapter();
    await a.createOrder({ amountMinor: 100, currency: "INR", idempotencyKey: "iso-001" });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. PayPalSandboxAdapter — OAuth token caching
// ─────────────────────────────────────────────────────────────────────────────

describe("PayPalSandboxAdapter — OAuth token caching", () => {
  let fetchSpy;
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.PAYPAL_CLIENT_ID = "TEST_CLIENT_ID";
    process.env.PAYPAL_CLIENT_SECRET = "TEST_CLIENT_SECRET";

    // Mock global fetch
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("fetches a new token when cache is empty", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: "TOKEN_ABC",
        expires_in: 32400,
      }),
    });

    const adapter = new PayPalSandboxAdapter();
    const token = await adapter._getAccessToken();

    expect(token).toBe("TOKEN_ABC");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/v1/oauth2/token"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("returns cached token on second call without re-fetching", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: "TOKEN_CACHED",
        expires_in: 32400, // 9 hours — well beyond the 60 s buffer
      }),
    });

    const adapter = new PayPalSandboxAdapter();

    const token1 = await adapter._getAccessToken();
    const token2 = await adapter._getAccessToken();

    expect(token1).toBe("TOKEN_CACHED");
    expect(token2).toBe("TOKEN_CACHED");
    // fetch should have been called only once
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("re-fetches token when existing token is within expiry buffer", async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: "TOKEN_FIRST",
          expires_in: 0, // immediately within the 60 s buffer → will re-fetch
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: "TOKEN_SECOND",
          expires_in: 32400,
        }),
      });

    const adapter = new PayPalSandboxAdapter();

    await adapter._getAccessToken(); // first fetch → TOKEN_FIRST
    const token2 = await adapter._getAccessToken(); // expired buffer → re-fetch

    expect(token2).toBe("TOKEN_SECOND");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("throws when PAYPAL_CLIENT_ID is missing", async () => {
    delete process.env.PAYPAL_CLIENT_ID;
    const adapter = new PayPalSandboxAdapter();
    await expect(adapter._getAccessToken()).rejects.toThrow(
      "PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET is not configured"
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws when PayPal OAuth returns a non-OK status", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => '{"error":"invalid_client"}',
    });

    const adapter = new PayPalSandboxAdapter();
    await expect(adapter._getAccessToken()).rejects.toThrow(
      "PayPal OAuth token request failed [401]"
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. getPayPalAdapter() factory
// ─────────────────────────────────────────────────────────────────────────────

describe("getPayPalAdapter() factory", () => {
  beforeEach(() => {
    _resetAdapterInstances();
  });

  afterEach(() => {
    _resetAdapterInstances();
  });

  it("returns MockDevAdapter when PAYMENT_MODE=mock", () => {
    process.env.PAYMENT_MODE = "mock";
    const adapter = getPayPalAdapter();
    expect(adapter).toBeInstanceOf(MockDevAdapter);
  });

  it("returns PayPalSandboxAdapter when PAYMENT_MODE=sandbox", () => {
    process.env.PAYMENT_MODE = "sandbox";
    const adapter = getPayPalAdapter();
    expect(adapter).toBeInstanceOf(PayPalSandboxAdapter);
  });

  it("returns PayPalSandboxAdapter when PAYMENT_MODE is unset", () => {
    delete process.env.PAYMENT_MODE;
    const adapter = getPayPalAdapter();
    expect(adapter).toBeInstanceOf(PayPalSandboxAdapter);
  });

  it("returns the same singleton on repeated calls (mock)", () => {
    process.env.PAYMENT_MODE = "mock";
    const a = getPayPalAdapter();
    const b = getPayPalAdapter();
    expect(a).toBe(b); // strict reference equality
  });

  it("returns the same singleton on repeated calls (sandbox)", () => {
    process.env.PAYMENT_MODE = "sandbox";
    const a = getPayPalAdapter();
    const b = getPayPalAdapter();
    expect(a).toBe(b);
  });

  it("_resetAdapterInstances() forces new instance creation", () => {
    process.env.PAYMENT_MODE = "mock";
    const before = getPayPalAdapter();
    _resetAdapterInstances();
    const after = getPayPalAdapter();
    expect(before).not.toBe(after);
  });

  it("mock adapter is isolated from sandbox adapter singleton", () => {
    process.env.PAYMENT_MODE = "mock";
    const mockAdapter = getPayPalAdapter();

    process.env.PAYMENT_MODE = "sandbox";
    const sandboxAdapter = getPayPalAdapter();

    expect(mockAdapter).toBeInstanceOf(MockDevAdapter);
    expect(sandboxAdapter).toBeInstanceOf(PayPalSandboxAdapter);
    expect(mockAdapter).not.toBe(sandboxAdapter);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Concurrent duplicate order creation — idempotency simulation
// ─────────────────────────────────────────────────────────────────────────────

describe("MockDevAdapter — concurrent duplicate idempotency simulation", () => {
  /**
   * In the real flow, duplicate idempotencyKey is caught by the MongoDB
   * unique index on Payment.idempotencyKey before the adapter is called.
   *
   * Here we verify that the adapter itself doesn't panic when called 5×
   * with the same idempotencyKey (the DB-level guard is tested in integration
   * tests; the adapter just generates unique IDs each time without throwing).
   */
  it("does not throw when called 5 times with the same idempotencyKey", async () => {
    const adapter = new MockDevAdapter();
    const key = "duplicate-idem-key";

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        adapter.createOrder({ amountMinor: 100000, currency: "INR", idempotencyKey: key })
      )
    );

    expect(results).toHaveLength(5);
    results.forEach((r) => {
      expect(r.providerOrderId).toMatch(/^MOCK-ORD-/);
      expect(r.status).toBe("CREATED");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. SRU-03: Webhook Verification, Concurrency & Reconciliation Suite
// ─────────────────────────────────────────────────────────────────────────────

describe("Task SRU-03: Webhook Verification, Idempotency Protection & Reconciliation", () => {
  let mongoServer;
  let testUser;
  let testShop;
  let testApp;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    // Register stub models if not yet registered
    if (!mongoose.models.Contribution) {
      const contributionSchema = new mongoose.Schema(
        {
          poolId: mongoose.Schema.Types.ObjectId,
          shopId: mongoose.Schema.Types.ObjectId,
          requirementId: mongoose.Schema.Types.ObjectId,
          createdByUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
          quantity: { type: Number, default: 200 },
          unit: { type: String, default: "BOX" },
          finalTotalPayableMinor: { type: Number, required: true },
          totalPaidMinor: { type: Number, default: 0 },
          totalRefundedMinor: { type: Number, default: 0 },
          state: {
            type: String,
            enum: ["PENDING_PAYMENT", "ACTIVE", "WITHDRAWN", "CANCELLED_UNDER_MOQ", "REFUNDED", "FINALIZED"],
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
          title: { type: String, default: "Test Pool" },
          state: { type: String, default: "RECRUITING" },
          targetMoq: { type: Number, default: 1000 },
        },
        { timestamps: true }
      );
      mongoose.model("GroupBuyPool", groupBuyPoolSchema);
    }

    if (!mongoose.models.PriceSnapshot) {
      const priceSnapshotSchema = new mongoose.Schema(
        {
          poolId: mongoose.Schema.Types.ObjectId,
          merchandiseTotalMinor: { type: Number, default: 480000 },
        },
        { timestamps: true }
      );
      mongoose.model("PriceSnapshot", priceSnapshotSchema);
    }

    testUser = { _id: new mongoose.Types.ObjectId(), role: "SHOP_OWNER" };
    testShop = { _id: new mongoose.Types.ObjectId() };

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = testUser;
      req.shop = testShop;
      next();
    });
    app.use("/api/payments", paymentRouter);
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
    process.env.PAYPAL_WEBHOOK_ID = "WH-MOCK-WEBHOOK-12345";
    _resetAdapterInstances();
  });

  afterEach(async () => {
    const collections = mongoose.connection.collections;
    for (const key of Object.keys(collections)) {
      await collections[key].deleteMany({});
    }
  });

  async function createFixtureContribution(amountMinor = 160000) {
    const Contribution = mongoose.model("Contribution");
    const GroupBuyPool = mongoose.model("GroupBuyPool");
    const pool = await GroupBuyPool.create({ title: "Pool Idempotency Test" });
    return Contribution.create({
      poolId: pool._id,
      shopId: testShop._id,
      requirementId: new mongoose.Types.ObjectId(),
      createdByUserId: testUser._id,
      finalTotalPayableMinor: amountMinor,
      totalPaidMinor: 0,
      state: "PENDING_PAYMENT",
      currency: "INR",
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // A. Webhook Signature Verification
  // ───────────────────────────────────────────────────────────────────────────

  describe("Cryptographic Webhook Verification (verifyWebhookSignature)", () => {
    it("rejects when PAYPAL-TRANSMISSION-SIG header is missing (400)", async () => {
      const headers = {
        "paypal-transmission-id": "test-id",
        "paypal-transmission-time": new Date().toISOString(),
      };
      await expect(
        verifyWebhookSignature({ headers, body: { event_type: "PAYMENT.CAPTURE.COMPLETED" } })
      ).rejects.toThrow(/PAYPAL-TRANSMISSION-SIG/);
    });

    it("rejects when transmission signature is invalid (400)", async () => {
      const headers = {
        "paypal-transmission-sig": "mock-invalid-sig",
        "paypal-transmission-id": "test-id",
        "paypal-transmission-time": new Date().toISOString(),
      };
      await expect(
        verifyWebhookSignature({ headers, body: { event_type: "PAYMENT.CAPTURE.COMPLETED" } })
      ).rejects.toThrow(/signature/i);
    });

    it("rejects when PAYPAL_WEBHOOK_ID does not match configured webhook ID (400)", async () => {
      const headers = {
        "paypal-transmission-sig": "valid-signature-1234",
        "paypal-transmission-id": "test-id",
        "paypal-transmission-time": new Date().toISOString(),
      };
      await expect(
        verifyWebhookSignature({
          headers,
          body: { event_type: "PAYMENT.CAPTURE.COMPLETED" },
          webhookId: "WRONG-WEBHOOK-ID",
        })
      ).rejects.toThrow(/webhook/i);
    });

    it("passes when valid transmission signature and matching webhook ID are provided", async () => {
      const headers = {
        "paypal-transmission-sig": "mock-valid-signature-proof",
        "paypal-transmission-id": "test-id-999",
        "paypal-transmission-time": new Date().toISOString(),
      };
      const result = await verifyWebhookSignature({
        headers,
        body: { event_type: "PAYMENT.CAPTURE.COMPLETED" },
        webhookId: "WH-MOCK-WEBHOOK-12345",
      });
      expect(result).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // B. 5 Identical Concurrent Capture Requests
  // ───────────────────────────────────────────────────────────────────────────

  describe("5 Identical Concurrent Capture Requests", () => {
    it("asserts exactly 1 payment capture is recorded and totalPaidMinor is not double-credited", async () => {
      const contribution = await createFixtureContribution(160000);
      const { payment } = await createPaymentOrder({
        contributionId: contribution._id.toString(),
        paymentPurpose: "INITIAL_JOIN",
        idempotencyKey: `idem-concurrent-capture-${Date.now()}`,
        payerUserId: testUser._id.toString(),
      });

      // Fire 5 identical concurrent capture requests simultaneously
      const capturePromises = Array.from({ length: 5 }, () =>
        capturePaymentOrder({
          paymentId: payment._id.toString(),
          providerOrderId: payment.providerOrderId,
          captureRequesterId: testUser._id.toString(),
        })
      );

      const results = await Promise.all(capturePromises);

      // Verify all 5 resolved safely
      expect(results).toHaveLength(5);

      // Exactly 1 winner should be isDuplicate: false, the other 4 are isDuplicate: true
      const duplicates = results.filter((r) => r.isDuplicate === true);
      const nonDuplicates = results.filter((r) => r.isDuplicate === false);

      expect(nonDuplicates).toHaveLength(1);
      expect(duplicates).toHaveLength(4);

      // Verify Payment record in MongoDB
      const persistedPayment = await Payment.findById(payment._id);
      expect(persistedPayment.paymentStatus).toBe("PAID");
      expect(persistedPayment.providerCaptureId).toBeTruthy();
      expect(persistedPayment.providerCaptureId).toMatch(/^MOCK-CAP-/);

      // Verify Contribution record in MongoDB — MUST be incremented EXACTLY ONCE
      const Contribution = mongoose.model("Contribution");
      const updatedContribution = await Contribution.findById(contribution._id);
      expect(updatedContribution.totalPaidMinor).toBe(160000); // NOT 5 × 160000!
      expect(updatedContribution.state).toBe("ACTIVE");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // C. Duplicate Webhook Deliveries
  // ───────────────────────────────────────────────────────────────────────────

  describe("Duplicate Webhook Deliveries (handlePayPalWebhook)", () => {
    it("asserts repeated duplicate webhooks never double-credit contribution or trigger duplicate transitions", async () => {
      const contribution = await createFixtureContribution(160000);
      const { payment } = await createPaymentOrder({
        contributionId: contribution._id.toString(),
        paymentPurpose: "INITIAL_JOIN",
        idempotencyKey: `idem-webhook-test-${Date.now()}`,
        payerUserId: testUser._id.toString(),
      });

      const webhookHeaders = {
        "paypal-transmission-sig": "mock-valid-signature-proof",
        "paypal-transmission-id": "tx-wh-001",
        "paypal-transmission-time": new Date().toISOString(),
      };

      const webhookBody = {
        id: "WH-EVT-001",
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        resource: {
          id: "MOCK-CAP-WEBHOOK-999",
          status: "COMPLETED",
          amount: { value: "1600.00", currency_code: "INR" },
          supplementary_data: {
            related_ids: {
              order_id: payment.providerOrderId,
            },
          },
        },
      };

      // Send 1st webhook
      const res1 = await handlePayPalWebhook({ headers: webhookHeaders, body: webhookBody });
      expect(res1.received).toBe(true);
      expect(res1.processed).toBe(true);
      expect(res1.isDuplicate).toBeFalsy();

      // Check DB after 1st webhook
      const post1Payment = await Payment.findById(payment._id);
      expect(post1Payment.paymentStatus).toBe("PAID");
      expect(post1Payment.providerCaptureId).toBe("MOCK-CAP-WEBHOOK-999");

      const Contribution = mongoose.model("Contribution");
      const post1Contribution = await Contribution.findById(contribution._id);
      expect(post1Contribution.totalPaidMinor).toBe(160000);
      expect(post1Contribution.state).toBe("ACTIVE");

      // Send 4 duplicate webhooks with the exact same payload
      for (let i = 2; i <= 5; i++) {
        const dupRes = await handlePayPalWebhook({ headers: webhookHeaders, body: webhookBody });
        expect(dupRes.received).toBe(true);
        expect(dupRes.isDuplicate).toBe(true);
      }

      // Assert totalPaidMinor is STILL 160000 (never double-credited!)
      const postDupContribution = await Contribution.findById(contribution._id);
      expect(postDupContribution.totalPaidMinor).toBe(160000);
      expect(postDupContribution.state).toBe("ACTIVE");
    });

    it("handles concurrent race between API capture and Webhook delivery safely", async () => {
      const contribution = await createFixtureContribution(160000);
      const { payment } = await createPaymentOrder({
        contributionId: contribution._id.toString(),
        paymentPurpose: "INITIAL_JOIN",
        idempotencyKey: `idem-race-test-${Date.now()}`,
        payerUserId: testUser._id.toString(),
      });

      const webhookHeaders = {
        "paypal-transmission-sig": "mock-valid-signature-proof",
        "paypal-transmission-id": "tx-wh-race",
        "paypal-transmission-time": new Date().toISOString(),
      };

      const webhookBody = {
        id: "WH-EVT-RACE-001",
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        resource: {
          id: "MOCK-CAP-RACE-999",
          status: "COMPLETED",
          amount: { value: "1600.00", currency_code: "INR" },
          supplementary_data: {
            related_ids: { order_id: payment.providerOrderId },
          },
        },
      };

      // Fire API capture and Webhook at the exact same instant
      const [apiCaptureResult, webhookResult] = await Promise.all([
        capturePaymentOrder({
          paymentId: payment._id.toString(),
          providerOrderId: payment.providerOrderId,
          captureRequesterId: testUser._id.toString(),
        }),
        handlePayPalWebhook({ headers: webhookHeaders, body: webhookBody }),
      ]);

      expect(apiCaptureResult).toBeDefined();
      expect(webhookResult.received).toBe(true);

      // Verify Contribution record in MongoDB — MUST be incremented EXACTLY ONCE
      const Contribution = mongoose.model("Contribution");
      const c = await Contribution.findById(contribution._id);
      expect(c.totalPaidMinor).toBe(160000); // NEVER 320000!
      expect(c.state).toBe("ACTIVE");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // D. Payment Reconciliation (reconcilePaymentState)
  // ───────────────────────────────────────────────────────────────────────────

  describe("Payment Reconciliation (reconcilePaymentState)", () => {
    it("reconciles payment in UNKNOWN state by querying provider and updating to PAID", async () => {
      const contribution = await createFixtureContribution(160000);
      const { payment } = await createPaymentOrder({
        contributionId: contribution._id.toString(),
        paymentPurpose: "INITIAL_JOIN",
        idempotencyKey: `idem-reconcile-unknown-${Date.now()}`,
        payerUserId: testUser._id.toString(),
      });

      // Simulate network timeout placing payment into UNKNOWN state
      await Payment.findByIdAndUpdate(payment._id, { paymentStatus: "UNKNOWN" });

      // Run reconciliation
      const result = await reconcilePaymentState(payment._id.toString());
      expect(result.reconciled).toBe(true);
      expect(result.newStatus).toBe("PAID");

      // Check MongoDB state
      const updatedPayment = await Payment.findById(payment._id);
      expect(updatedPayment.paymentStatus).toBe("PAID");
      expect(updatedPayment.providerCaptureId).toBeTruthy();

      const Contribution = mongoose.model("Contribution");
      const updatedContribution = await Contribution.findById(contribution._id);
      expect(updatedContribution.totalPaidMinor).toBe(160000);
      expect(updatedContribution.state).toBe("ACTIVE");
    });

    it("reconciles payment in CAPTURE_PENDING state", async () => {
      const contribution = await createFixtureContribution(160000);
      const { payment } = await createPaymentOrder({
        contributionId: contribution._id.toString(),
        paymentPurpose: "INITIAL_JOIN",
        idempotencyKey: `idem-reconcile-pending-${Date.now()}`,
        payerUserId: testUser._id.toString(),
      });

      await Payment.findByIdAndUpdate(payment._id, { paymentStatus: "CAPTURE_PENDING" });

      const result = await reconcilePaymentState(payment._id.toString());
      expect(result.reconciled).toBe(true);
      expect(result.newStatus).toBe("PAID");

      const updatedPayment = await Payment.findById(payment._id);
      expect(updatedPayment.paymentStatus).toBe("PAID");
    });

    it("already-PAID payment is idempotent and not re-processed", async () => {
      const contribution = await createFixtureContribution(160000);
      const { payment } = await createPaymentOrder({
        contributionId: contribution._id.toString(),
        paymentPurpose: "INITIAL_JOIN",
        idempotencyKey: `idem-reconcile-paid-${Date.now()}`,
        payerUserId: testUser._id.toString(),
      });

      await capturePaymentOrder({
        paymentId: payment._id.toString(),
        providerOrderId: payment.providerOrderId,
        captureRequesterId: testUser._id.toString(),
      });

      const result = await reconcilePaymentState(payment._id.toString());
      expect(result.reconciled).toBe(false);
      expect(result.alreadySettled).toBe(true);

      const Contribution = mongoose.model("Contribution");
      const c = await Contribution.findById(contribution._id);
      expect(c.totalPaidMinor).toBe(160000); // unchanged
    });

    it("reconciles payment in UNKNOWN state with provider status VOIDED to FAILED", async () => {
      const contribution = await createFixtureContribution(160000);
      const { payment } = await createPaymentOrder({
        contributionId: contribution._id.toString(),
        paymentPurpose: "INITIAL_JOIN",
        idempotencyKey: `idem-reconcile-voided-${Date.now()}`,
        payerUserId: testUser._id.toString(),
      });

      await Payment.findByIdAndUpdate(payment._id, { paymentStatus: "UNKNOWN" });

      const adapter = getPayPalAdapter();
      adapter.setMockOrderStatus(payment.providerOrderId, "VOIDED");

      const result = await reconcilePaymentState(payment._id.toString());
      expect(result.reconciled).toBe(true);
      expect(result.newStatus).toBe("FAILED");

      const updated = await Payment.findById(payment._id);
      expect(updated.paymentStatus).toBe("FAILED");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // E. HTTP Route Tests (POST /api/payments/webhook & :paymentId/reconcile)
  // ───────────────────────────────────────────────────────────────────────────

  describe("HTTP Routes: Webhook & Reconcile", () => {
    it("POST /api/payments/webhook rejects with 400 when PAYPAL-TRANSMISSION-SIG is missing", async () => {
      const res = await request(testApp)
        .post("/api/payments/webhook")
        .send({ event_type: "PAYMENT.CAPTURE.COMPLETED" });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/PAYPAL-TRANSMISSION-SIG/);
    });

    it("POST /api/payments/webhook processes valid webhook and captures payment (200)", async () => {
      const contribution = await createFixtureContribution(160000);
      const { payment } = await createPaymentOrder({
        contributionId: contribution._id.toString(),
        paymentPurpose: "INITIAL_JOIN",
        idempotencyKey: `idem-http-wh-${Date.now()}`,
        payerUserId: testUser._id.toString(),
      });

      const res = await request(testApp)
        .post("/api/payments/webhook")
        .set("paypal-transmission-sig", "valid-signature")
        .set("paypal-transmission-id", "tx-999")
        .set("paypal-transmission-time", new Date().toISOString())
        .send({
          id: "WH-EVT-HTTP-001",
          event_type: "PAYMENT.CAPTURE.COMPLETED",
          resource: {
            id: "MOCK-CAP-HTTP-WH",
            status: "COMPLETED",
            supplementary_data: {
              related_ids: { order_id: payment.providerOrderId },
            },
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.data.processed).toBe(true);

      const capturedPayment = await Payment.findById(payment._id);
      expect(capturedPayment.paymentStatus).toBe("PAID");
    });

    it("POST /api/payments/:paymentId/reconcile returns 200 with reconciled state", async () => {
      const contribution = await createFixtureContribution(160000);
      const { payment } = await createPaymentOrder({
        contributionId: contribution._id.toString(),
        paymentPurpose: "INITIAL_JOIN",
        idempotencyKey: `idem-http-rec-${Date.now()}`,
        payerUserId: testUser._id.toString(),
      });

      await Payment.findByIdAndUpdate(payment._id, { paymentStatus: "UNKNOWN" });

      const res = await request(testApp)
        .post(`/api/payments/${payment._id}/reconcile`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.data.reconciled).toBe(true);
      expect(res.body.data.newStatus).toBe("PAID");
    });
  });
});

