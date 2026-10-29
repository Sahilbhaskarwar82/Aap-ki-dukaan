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
} from "../controllers/payment.controller.js";

const router = Router();

// ── Middleware stub ───────────────────────────────────────────────────────────
// When Prakhar's auth middleware (authenticateJWT, requireRoles) is wired into
// app.js, the stubs below are replaced automatically.  For standalone dev/test,
// we attach a minimal user object so controllers can read req.user.
//
// IMPORTANT: This stub MUST be removed / overridden by the real JWT middleware
// before any route is exposed in production.

function devAuthStub(req, _res, next) {
  // Only active when NODE_ENV !== 'production' and real middleware isn't present
  if (!req.user && process.env.NODE_ENV !== "production") {
    // Tests inject req.user via supertest headers or test helper
    req.user = req.user ?? null;
    req.shop = req.shop ?? null;
  }
  next();
}

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
router.post("/create-order", devAuthStub, createOrder);

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
router.post("/:paymentId/capture", devAuthStub, captureOrder);

/**
 * POST /api/payments/:paymentId/cancel
 *
 * Marks a payment CANCELLED when the buyer dismisses the PayPal checkout.
 * Contribution stays PENDING_PAYMENT — buyer may retry.
 *
 * Required roles: SHOP_OWNER (must be the original payer)
 */
router.post("/:paymentId/cancel", devAuthStub, cancelCheckout);

/**
 * GET /api/payments
 *
 * Lists the authenticated shop's payment history (paginated).
 * Query: ?page=1&limit=20
 *
 * Required roles: SHOP_OWNER, ADMIN, REVIEWER
 */
router.get("/", devAuthStub, listPayments);

export default router;
