/**
 * Payment Controller — SRU-02
 *
 * Thin HTTP adapter layer.  All business logic lives in payment.service.js.
 * Follows the project's asyncHandler + ApiError + APIResponse conventions.
 */

import { asyncHandler } from "../utils/asyncHandler.js";
import { APIResponse } from "../utils/apiResponse.js";
import { ApiError } from "../utils/apiError.js";
import {
  createPaymentOrder,
  capturePaymentOrder,
  handleCancelledOrFailedCheckout,
  listPaymentsForShop,
  handlePayPalWebhook,
  reconcilePaymentState,
} from "../services/payment.service.js";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payments/create-order
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a PayPal Sandbox order.
 *
 * Request body:
 *   { contributionId, paymentPurpose, idempotencyKey, priceSnapshotId? }
 *
 * The `amountMinor` and `currency` are NEVER read from the request body;
 * they are derived exclusively from the database (FR-PAY-001).
 *
 * Response 201:
 *   { paymentId, providerOrderId, approveUrl, amountMinor, currency,
 *     isTestTransaction, isDuplicate }
 */
export const createOrder = asyncHandler(async (req, res) => {
  const {
    contributionId,
    paymentPurpose,
    idempotencyKey,
    priceSnapshotId,
    returnUrl,
    cancelUrl,
  } = req.body;

  // ── Input validation ──────────────────────────────────────────────────────
  if (!contributionId) {
    throw new ApiError(400, "contributionId is required.");
  }
  if (!paymentPurpose) {
    throw new ApiError(400, "paymentPurpose is required.");
  }
  if (!idempotencyKey || typeof idempotencyKey !== "string" || idempotencyKey.length < 8) {
    throw new ApiError(
      400,
      "idempotencyKey is required and must be at least 8 characters."
    );
  }

  const VALID_PURPOSES = [
    "INITIAL_JOIN",
    "QUANTITY_INCREASE_DELTA",
    "POST_APPROVAL_FINAL",
    "UNDER_MOQ_SURCHARGE",
  ];
  if (!VALID_PURPOSES.includes(paymentPurpose)) {
    throw new ApiError(
      400,
      `Invalid paymentPurpose. Must be one of: ${VALID_PURPOSES.join(", ")}`
    );
  }

  if (paymentPurpose === "POST_APPROVAL_FINAL" && !priceSnapshotId) {
    throw new ApiError(
      400,
      "priceSnapshotId is required for POST_APPROVAL_FINAL payments."
    );
  }

  // req.user is populated by authenticateJWT middleware (Prakhar's)
  const payerUserId = req.user._id;

  const result = await createPaymentOrder({
    contributionId,
    paymentPurpose,
    idempotencyKey,
    payerUserId,
    priceSnapshotId: priceSnapshotId ?? null,
    returnUrl,
    cancelUrl,
  });

  const statusCode = result.isDuplicate ? 200 : 201;

  return res.status(statusCode).json(
    new APIResponse(statusCode, {
      paymentId: result.payment._id,
      providerOrderId: result.payment.providerOrderId,
      approveUrl: result.approveUrl,
      amountMinor: result.payment.amountMinor,
      currency: result.payment.currency,
      paymentStatus: result.payment.paymentStatus,
      isTestTransaction: result.payment.isTestTransaction,
      provider: result.payment.provider,
      isDuplicate: result.isDuplicate,
    }, result.isDuplicate ? "Existing payment returned (idempotent)." : "Payment order created.")
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payments/:paymentId/capture
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Server-side capture verification.
 *
 * FR-PAY-002 / FR-PAY-007: A browser redirect alone NEVER marks a contribution
 * paid.  This endpoint performs the authoritative server-side capture call to
 * PayPal and is the only code path that writes paymentStatus='PAID'.
 *
 * Request body:
 *   { providerOrderId }   — PayPal order ID returned by the JS SDK on approval
 *
 * Response 200:
 *   { payment, contribution, isDuplicate }
 */
export const captureOrder = asyncHandler(async (req, res) => {
  const { paymentId } = req.params;
  const { providerOrderId } = req.body;

  if (!providerOrderId) {
    throw new ApiError(
      400,
      "providerOrderId is required. This must be the PayPal order ID returned " +
        "after buyer approval — do not supply a client-generated value."
    );
  }

  const captureRequesterId = req.user._id;

  const result = await capturePaymentOrder({
    paymentId,
    providerOrderId,
    captureRequesterId,
  });

  return res.status(200).json(
    new APIResponse(
      200,
      {
        payment: result.payment,
        contribution: result.contribution,
        isDuplicate: result.isDuplicate,
      },
      result.isDuplicate
        ? "Payment already captured (idempotent response)."
        : "Payment captured and verified successfully."
    )
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payments/:paymentId/cancel   (buyer cancelled PayPal checkout)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Marks a payment as CANCELLED when the buyer dismisses the PayPal checkout.
 * The Contribution remains in PENDING_PAYMENT — the buyer may retry.
 *
 * Response 200: { payment }
 */
export const cancelCheckout = asyncHandler(async (req, res) => {
  const { paymentId } = req.params;
  const payment = await handleCancelledOrFailedCheckout(paymentId, "CANCELLED");

  return res.status(200).json(
    new APIResponse(200, { payment }, "Payment marked as cancelled.")
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/payments
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lists the authenticated shop's payment history (paginated).
 * Enforces shop ownership — a buyer can only see their own payments.
 *
 * Query params: ?page=1&limit=20
 *
 * Response 200: { payments: [], total, page, limit }
 */
export const listPayments = asyncHandler(async (req, res) => {
  // req.shop is populated by authenticateJWT + requireShopProfile middleware
  const shopId = req.shop?._id ?? req.user?.shopId;
  if (!shopId) {
    throw new ApiError(403, "No shop profile associated with this account.");
  }

  const { page, limit } = req.query;
  const result = await listPaymentsForShop(shopId, { page, limit });

  return res.status(200).json(
    new APIResponse(200, result, "Payments retrieved successfully.")
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payments/webhook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handles incoming PayPal webhooks (SRU-03).
 * Verifies headers (PAYPAL-TRANSMISSION-SIG, etc.) and processes events idempotently.
 */
export const handleWebhook = asyncHandler(async (req, res) => {
  const result = await handlePayPalWebhook({
    headers: req.headers,
    body: req.body,
  });

  return res.status(200).json(
    new APIResponse(200, result, "Webhook processed successfully.")
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payments/:paymentId/reconcile
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reconciles unknown or timed-out payment state with the provider (SRU-03).
 */
export const reconcilePayment = asyncHandler(async (req, res) => {
  const { paymentId } = req.params;
  const result = await reconcilePaymentState(paymentId);

  return res.status(200).json(
    new APIResponse(200, result, "Payment reconciliation evaluated.")
  );
});
