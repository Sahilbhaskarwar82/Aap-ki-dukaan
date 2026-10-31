/**
 * Payment Routes — SRU-02
 *
 * Mounts payment endpoints under /api/payments.
 *
 * Auth & RBAC are delegated to middleware wired in app.js by Prakhar.
 * Stubs are provided here so routes work standalone during parallel dev.
 *
 * Endpoint summary:
 *   POST   /api/payments/create-order          → createOrder
 *   POST   /api/payments/:paymentId/capture    → captureOrder    (FR-PAY-007)
 *   POST   /api/payments/:paymentId/cancel     → cancelCheckout
 *   GET    /api/payments                       → listPayments
 */

import { Router } from "express";
import {
  createOrder,
  captureOrder,
  cancelCheckout,
  listPayments,
  handleWebhook,
  reconcilePayment,
} from "../controllers/payment.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";

const router = Router();

// ── Auth Guard Middleware ───────────────────────────────────────────────────
// In production or when Bearer token / cookie is supplied, validates JWT.
// In dev/test when running without tokens, falls back to injected req.user/shop.

function devAuthStub(req, _res, next) {
  if (!req.user && process.env.NODE_ENV !== "production") {
    req.user = req.user ?? null;
    req.shop = req.shop ?? null;
  }
  next();
}

const authGuard = (req, res, next) => {
  if (req.user) return next();
  const token =
    req.cookies?.accessToken ||
    req.cookies?.token ||
    req.header("Authorization")?.replace("Bearer ", "");

  if (token) {
    return verifyJWT(req, res, next);
  }
  if (process.env.NODE_ENV !== "production") {
    return devAuthStub(req, res, next);
  }
  return verifyJWT(req, res, next);
};

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/payments/create-order
 *
 * Creates a PayPal Sandbox order.  Amount is derived server-side from the
 * Contribution / PriceSnapshot — client MUST NOT supply amountMinor.
 *
 * Required roles: SHOP_OWNER
 * Rate limit: applied at app level (Prakhar's rateLimiter.middleware.js)
 *
 * Body: { contributionId, paymentPurpose, idempotencyKey, priceSnapshotId? }
 */
router.post("/create-order", authGuard, createOrder);

/**
 * POST /api/payments/:paymentId/capture
 *
 * Server-side PayPal capture verification.  The only endpoint that may write
 * paymentStatus='PAID'.  FR-PAY-002 / FR-PAY-007 enforcement.
 *
 * Required roles: SHOP_OWNER (must be the original payer)
 *
 * Body: { providerOrderId }
 */
router.post("/:paymentId/capture", authGuard, captureOrder);

/**
 * POST /api/payments/:paymentId/cancel
 *
 * Marks a payment CANCELLED when the buyer dismisses the PayPal checkout.
 * Contribution stays PENDING_PAYMENT — buyer may retry.
 *
 * Required roles: SHOP_OWNER (must be the original payer)
 */
router.post("/:paymentId/cancel", authGuard, cancelCheckout);

/**
 * GET /api/payments
 *
 * Lists the authenticated shop's payment history (paginated).
 * Query: ?page=1&limit=20
 *
 * Required roles: SHOP_OWNER, ADMIN, REVIEWER
 */
router.get("/", authGuard, listPayments);

/**
 * POST /api/payments/webhook
 *
 * Cryptographically verifies and idempotently processes PayPal webhooks (SRU-03).
 * Does NOT require JWT authentication (called directly by PayPal webhook infrastructure).
 */
router.post("/webhook", handleWebhook);

/**
 * POST /api/payments/:paymentId/reconcile
 *
 * Reconciles an unknown or pending payment with the payment provider.
 */
router.post("/:paymentId/reconcile", authGuard, reconcilePayment);

export default router;
