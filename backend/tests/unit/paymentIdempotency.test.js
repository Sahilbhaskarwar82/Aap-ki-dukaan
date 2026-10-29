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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  getPayPalAdapter,
  _resetAdapterInstances,
  MockDevAdapter,
  PayPalSandboxAdapter,
  toDecimalString,
  toMinorUnits,
} from "../../src/services/payments/paypalAdapter.service.js";

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
