/**
 * PayPal Sandbox Adapter — SRU-01
 *
 * Wraps PayPal REST API v2 calls needed for the CoBuy AI payment flow:
 *   - createOrder  → POST /v2/checkout/orders
 *   - captureOrder → POST /v2/checkout/orders/:id/capture
 *   - refundCapture → POST /v2/payments/captures/:id/refund
 *
 * Also provides a fully isolated MOCK_DEV adapter (activated via
 * PAYMENT_MODE=mock) for offline automated tests.  Mock records are flagged
 * with provider: 'MOCK_DEV' and must never be confused with live transactions.
 *
 * Security constraints (HLD §8):
 *  - PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET live exclusively in .env;
 *    they are never passed to the frontend or logged.
 *  - OAuth 2.0 access tokens are cached in-process until expiry to avoid
 *    per-request token fetches.
 *  - All amounts are received from callers in MINOR UNITS and converted to
 *    the decimal string format PayPal expects (e.g. 480000 paise → "4800.00").
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const PAYPAL_BASE_URL = "https://api-m.sandbox.paypal.com";
const TOKEN_EXPIRY_BUFFER_MS = 60_000; // refresh token 60 s before it expires
const REQUEST_TIMEOUT_MS = 15_000; // FR-AI / FR-PAY: 15 s max per external call

// ── Minor-unit → decimal string conversion ────────────────────────────────────

/**
 * Converts an integer minor-unit amount to a decimal string PayPal accepts.
 *
 * @param {number} amountMinor  e.g. 480000 (paise for ₹4,800)
 * @param {string} currency     "INR" | "USD"
 * @returns {string}            e.g. "4800.00"
 */
function toDecimalString(amountMinor, currency) {
  // Both INR (paise) and USD (cents) have 2 decimal places.
  const decimalPlaces = 2;
  const divisor = Math.pow(10, decimalPlaces);
  return (amountMinor / divisor).toFixed(decimalPlaces);
}

/**
 * Converts a PayPal decimal string back to integer minor units.
 *
 * @param {string} valueStr  e.g. "4800.00"
 * @param {string} currency  "INR" | "USD"
 * @returns {number}         480000
 */
function toMinorUnits(valueStr, currency) {
  const decimalPlaces = 2;
  const multiplier = Math.pow(10, decimalPlaces);
  return Math.round(parseFloat(valueStr) * multiplier);
}

// ── Fetch with timeout helper ─────────────────────────────────────────────────

async function fetchWithTimeout(url, options, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REAL PayPal Sandbox Adapter
// ─────────────────────────────────────────────────────────────────────────────

class PayPalSandboxAdapter {
  constructor() {
    this._accessToken = null;
    this._tokenExpiresAt = 0; // epoch ms
  }

  // ── OAuth 2.0 Token Management ──────────────────────────────────────────────

  /**
   * Fetches (or returns cached) a PayPal OAuth 2.0 client-credentials token.
   * Token is cached in-process and refreshed 60 s before expiry.
   *
   * @returns {Promise<string>} Bearer access token
   * @throws  {Error}          If credentials are missing or PayPal returns an error
   */
  async _getAccessToken() {
    const now = Date.now();
    if (this._accessToken && now < this._tokenExpiresAt - TOKEN_EXPIRY_BUFFER_MS) {
      return this._accessToken;
    }

    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error(
        "PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET is not configured in environment variables."
      );
    }

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const response = await fetchWithTimeout(
      `${PAYPAL_BASE_URL}/v1/oauth2/token`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `PayPal OAuth token request failed [${response.status}]: ${errorBody}`
      );
    }

    const data = await response.json();

    this._accessToken = data.access_token;
    // expires_in is in seconds; convert to epoch ms
    this._tokenExpiresAt = now + data.expires_in * 1000;

    return this._accessToken;
  }

  // ── Helper: authenticated PayPal API request ───────────────────────────────

  /**
   * @param {string} method      HTTP verb
   * @param {string} path        PayPal API path (e.g. "/v2/checkout/orders")
   * @param {object|null} body   JSON request body (or null for GET / empty POST)
   * @param {object} extraHeaders Optional extra headers (e.g. idempotency keys)
   * @returns {Promise<{status: number, data: object}>}
   */
  async _request(method, path, body = null, extraHeaders = {}) {
    const token = await this._getAccessToken();

    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...extraHeaders,
    };

    const fetchOptions = {
      method,
      headers,
    };
    if (body !== null) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetchWithTimeout(
      `${PAYPAL_BASE_URL}${path}`,
      fetchOptions
    );

    // 204 No Content has no JSON body
    const data = response.status === 204 ? {} : await response.json();

    return { status: response.status, data };
  }

  // ── createOrder ─────────────────────────────────────────────────────────────

  /**
   * Creates a PayPal Sandbox order for a contribution payment.
   *
   * @param {object} params
   * @param {number} params.amountMinor     Amount in minor units (paise / cents)
   * @param {string} params.currency        "INR" | "USD"
   * @param {string} params.idempotencyKey  Unique key to prevent duplicate orders
   * @param {string} params.description     Human-readable description (e.g. pool title)
   * @param {string} params.returnUrl       URL PayPal redirects to after approval
   * @param {string} params.cancelUrl       URL PayPal redirects to on cancellation
   * @returns {Promise<{providerOrderId: string, approveUrl: string, status: string}>}
   */
  async createOrder({ amountMinor, currency, idempotencyKey, description, returnUrl, cancelUrl }) {
    const payload = {
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: currency,
            value: toDecimalString(amountMinor, currency),
          },
          description: description ?? "Aap Ki Dukan — Group Buy Pool Payment",
        },
      ],
      application_context: {
        brand_name: "Aap Ki Dukan (CoBuy AI)",
        landing_page: "NO_PREFERENCE",
        user_action: "PAY_NOW",
        return_url: returnUrl,
        cancel_url: cancelUrl,
      },
    };

    const { status, data } = await this._request("POST", "/v2/checkout/orders", payload, {
      "PayPal-Request-Id": idempotencyKey, // PayPal-side idempotency
    });

    if (status !== 201) {
      throw new Error(
        `PayPal createOrder failed [${status}]: ${JSON.stringify(data)}`
      );
    }

    const approveLink = data.links?.find((l) => l.rel === "approve");

    return {
      providerOrderId: data.id,
      status: data.status, // "CREATED"
      approveUrl: approveLink?.href ?? null,
    };
  }

  // ── captureOrder ────────────────────────────────────────────────────────────

  /**
   * Captures a buyer-approved PayPal Sandbox order.
   *
   * Must only be called from the server after the frontend reports approval.
   * A browser redirect alone NEVER marks a contribution paid (FR-PAY-007 / SRU-02).
   *
   * @param {string} providerOrderId  PayPal order ID from createOrder
   * @param {string} idempotencyKey   Same key used in createOrder to prevent double-capture
   * @returns {Promise<{providerCaptureId: string, captureStatus: string, amountMinor: number, currency: string}>}
   */
  async captureOrder(providerOrderId, idempotencyKey) {
    const { status, data } = await this._request(
      "POST",
      `/v2/checkout/orders/${providerOrderId}/capture`,
      {}, // empty body required by PayPal
      {
        "PayPal-Request-Id": `capture-${idempotencyKey}`,
      }
    );

    if (status !== 201 && status !== 200) {
      throw new Error(
        `PayPal captureOrder failed [${status}]: ${JSON.stringify(data)}`
      );
    }

    const capture =
      data.purchase_units?.[0]?.payments?.captures?.[0];

    if (!capture) {
      throw new Error("PayPal captureOrder response missing capture details.");
    }

    if (capture.status !== "COMPLETED") {
      throw new Error(
        `PayPal capture status is '${capture.status}', expected 'COMPLETED'.`
      );
    }

    return {
      providerCaptureId: capture.id,
      captureStatus: capture.status, // "COMPLETED"
      amountMinor: toMinorUnits(capture.amount.value, capture.amount.currency_code),
      currency: capture.amount.currency_code,
      rawResponse: data, // stored (sanitised) in providerResponseSnapshot
    };
  }

  // ── refundCapture ───────────────────────────────────────────────────────────

  /**
   * Issues a full or partial refund against a captured PayPal payment.
   *
   * @param {object} params
   * @param {string} params.providerCaptureId  PayPal capture ID to refund
   * @param {number} params.amountMinor         Amount to refund in minor units (null = full refund)
   * @param {string} params.currency            "INR" | "USD"
   * @param {string} params.idempotencyKey      Unique key per refund to prevent double-refund
   * @param {string} params.reason              Human-readable refund reason
   * @returns {Promise<{providerRefundId: string, refundStatus: string, amountMinor: number}>}
   */
  async refundCapture({ providerCaptureId, amountMinor, currency, idempotencyKey, reason }) {
    const body = {};

    if (amountMinor !== null && amountMinor !== undefined) {
      body.amount = {
        value: toDecimalString(amountMinor, currency),
        currency_code: currency,
      };
    }

    if (reason) {
      body.note_to_payer = reason.slice(0, 255); // PayPal max 255 chars
    }

    const { status, data } = await this._request(
      "POST",
      `/v2/payments/captures/${providerCaptureId}/refund`,
      body,
      {
        "PayPal-Request-Id": idempotencyKey,
      }
    );

    if (status !== 201 && status !== 200) {
      throw new Error(
        `PayPal refundCapture failed [${status}]: ${JSON.stringify(data)}`
      );
    }

    return {
      providerRefundId: data.id,
      refundStatus: data.status, // "COMPLETED" or "PENDING"
      amountMinor:
        data.amount?.value != null
          ? toMinorUnits(data.amount.value, data.amount.currency_code)
          : amountMinor,
      currency: data.amount?.currency_code ?? currency,
      rawResponse: data,
    };
  }

  // ── getOrderDetails ─────────────────────────────────────────────────────────

  /**
   * Retrieves order status and capture details from PayPal.
   *
   * @param {string} providerOrderId
   * @returns {Promise<object>}
   */
  async getOrderDetails(providerOrderId) {
    const { status, data } = await this._request("GET", `/v2/checkout/orders/${providerOrderId}`);
    if (status !== 200) {
      throw new Error(`PayPal getOrderDetails failed [${status}]: ${JSON.stringify(data)}`);
    }
    return data;
  }

  // ── verifyWebhookSignature ──────────────────────────────────────────────────

  /**
   * Cryptographically verifies PayPal webhook headers using PayPal REST API.
   *
   * @param {object} params
   * @param {string} params.authAlgo
   * @param {string} params.certUrl
   * @param {string} params.transmissionId
   * @param {string} params.transmissionSig
   * @param {string} params.transmissionTime
   * @param {string} params.webhookId
   * @param {object} params.eventBody
   * @returns {Promise<{ verificationStatus: string, raw?: object }>}
   */
  async verifyWebhookSignature({
    authAlgo,
    certUrl,
    transmissionId,
    transmissionSig,
    transmissionTime,
    webhookId,
    eventBody,
  }) {
    const payload = {
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: webhookId,
      webhook_event: eventBody,
    };

    const { status, data } = await this._request(
      "POST",
      "/v1/notifications/verify-webhook-signature",
      payload
    );

    if (status !== 200) {
      return { verificationStatus: "FAILURE", raw: data };
    }

    return { verificationStatus: data.verification_status, raw: data };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MOCK_DEV Adapter  (PAYMENT_MODE=mock)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Offline mock adapter for automated tests.
 *
 * Mimics the real adapter's interface without making any HTTP calls.
 * Every response is flagged so it cannot be confused with a live transaction.
 *
 * Records created via this adapter must always carry:
 *   provider: 'MOCK_DEV'
 *   isTestTransaction: true  (enforced on the Payment model)
 */
class MockDevAdapter {
  constructor() {
    this._mockOrders = new Map();
  }

  /**
   * Generates a deterministic mock PayPal order ID.
   * Format: MOCK-ORD-<timestamp>-<random4>
   */
  _mockOrderId() {
    return `MOCK-ORD-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  _mockCaptureId() {
    return `MOCK-CAP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  _mockRefundId() {
    return `MOCK-REF-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  async createOrder({ amountMinor, currency, idempotencyKey, description }) {
    const providerOrderId = this._mockOrderId();
    this._mockOrders.set(providerOrderId, {
      id: providerOrderId,
      status: "CREATED",
      amountMinor,
      currency,
      idempotencyKey,
      description,
      captures: [],
    });
    return {
      providerOrderId,
      status: "CREATED",
      approveUrl: `https://sandbox.paypal.com/checkoutnow?token=${providerOrderId}`,
      _isMock: true,
    };
  }

  async captureOrder(providerOrderId, idempotencyKey) {
    if (!providerOrderId.startsWith("MOCK-ORD-")) {
      throw new Error(
        `MockDevAdapter: unexpected providerOrderId format '${providerOrderId}'.`
      );
    }
    const captureId = this._mockCaptureId();
    const existing = this._mockOrders.get(providerOrderId);
    if (existing) {
      existing.status = "COMPLETED";
      existing.captures.push({ id: captureId, status: "COMPLETED" });
    }
    return {
      providerCaptureId: captureId,
      captureStatus: "COMPLETED",
      amountMinor: null, // caller must use the amount they stored at createOrder time
      currency: null,
      rawResponse: { _isMock: true, providerOrderId },
    };
  }

  async refundCapture({ providerCaptureId, amountMinor, currency, idempotencyKey }) {
    return {
      providerRefundId: this._mockRefundId(),
      refundStatus: "COMPLETED",
      amountMinor,
      currency,
      rawResponse: { _isMock: true, providerCaptureId },
    };
  }

  async getOrderDetails(providerOrderId) {
    const existing = this._mockOrders.get(providerOrderId);
    if (existing) {
      const status =
        existing.mockStatus ??
        (existing.status === "CREATED" ? "COMPLETED" : existing.status);
      const captures =
        existing.captures.length > 0
          ? existing.captures
          : status === "COMPLETED"
            ? [{ id: `MOCK-CAP-${existing.id.slice(9) || Date.now()}`, status: "COMPLETED" }]
            : [];

      return {
        id: existing.id,
        status,
        purchase_units: [
          {
            payments: {
              captures,
            },
          },
        ],
        _isMock: true,
      };
    }
    // Return COMPLETED mock order if not tracked in map
    return {
      id: providerOrderId,
      status: "COMPLETED",
      purchase_units: [
        {
          payments: {
            captures: [{ id: `MOCK-CAP-${Date.now()}`, status: "COMPLETED" }],
          },
        },
      ],
      _isMock: true,
    };
  }

  setMockOrderStatus(providerOrderId, status) {
    const existing = this._mockOrders.get(providerOrderId);
    if (existing) {
      existing.mockStatus = status;
    }
  }

  async verifyWebhookSignature({ transmissionSig, webhookId }) {
    const expectedWebhookId = process.env.PAYPAL_WEBHOOK_ID;
    if (expectedWebhookId && webhookId && webhookId !== expectedWebhookId) {
      return { verificationStatus: "FAILURE" };
    }
    if (!transmissionSig || transmissionSig === "invalid" || transmissionSig === "mock-invalid-sig") {
      return { verificationStatus: "FAILURE" };
    }
    return { verificationStatus: "SUCCESS" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory — returns the correct adapter based on PAYMENT_MODE env var
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Singleton instances — one real, one mock.
 * Instantiated lazily so tests can import the module before setting env vars.
 */
let _sandboxInstance = null;
let _mockInstance = null;

/**
 * Returns the active PayPal adapter based on the PAYMENT_MODE environment variable.
 *
 *   PAYMENT_MODE=mock        → MockDevAdapter  (offline tests, CI)
 *   PAYMENT_MODE=sandbox     → PayPalSandboxAdapter  (default)
 *   (unset)                  → PayPalSandboxAdapter
 *
 * @returns {PayPalSandboxAdapter | MockDevAdapter}
 */
export function getPayPalAdapter() {
  const mode = (process.env.PAYMENT_MODE ?? "sandbox").toLowerCase();

  if (mode === "mock") {
    if (!_mockInstance) _mockInstance = new MockDevAdapter();
    return _mockInstance;
  }

  if (!_sandboxInstance) _sandboxInstance = new PayPalSandboxAdapter();
  return _sandboxInstance;
}

/**
 * Resets the cached adapter instances.
 * Useful in tests to force re-instantiation after changing env vars.
 */
export function _resetAdapterInstances() {
  _sandboxInstance = null;
  _mockInstance = null;
}

// Named exports for testing individual classes directly
export { PayPalSandboxAdapter, MockDevAdapter, toDecimalString, toMinorUnits };
