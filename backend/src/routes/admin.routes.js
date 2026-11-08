import { Router } from "express";
import {
  createSupplier,
  updateSupplier,
  createOffer,
  updateOffer,
  getReconciliationDashboard,
  annotatePayment,
  getAuditLogs,
  getAILogs,
  runLifecycleCheck,
  resetUnderMoqPool,
} from "../controllers/admin.controller.js";
import { verifyJWT, verifyRole } from "../middleware/auth.middleware.js";
import { ApiError } from "../utils/apiError.js";

const router = Router();

/**
 * Authentication Guard for Admin endpoints.
 * Resolves Bearer token or cookie; verifies active session.
 */
function authGuard(req, res, next) {
  if (req.user) return next();

  const token =
    req.cookies?.accessToken ||
    req.cookies?.token ||
    req.header("Authorization")?.replace("Bearer ", "");

  if (token) {
    return verifyJWT(req, res, next);
  }

  throw new ApiError(401, "Authentication required to access admin workspace.");
}

const requireAdmin = verifyRole("ADMIN");
const requireAdminOrReviewer = verifyRole("ADMIN", "REVIEWER");
const requireAdminOrSupplier = verifyRole("ADMIN", "SUPPLIER");

// ─────────────────────────────────────────────────────────────────────────────
// Catalogue Moderation APIs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/admin/suppliers
 * Create/verify supplier (Admin only).
 */
router.post("/suppliers", authGuard, requireAdmin, createSupplier);

/**
 * PATCH /api/admin/suppliers/:id
 * Update supplier profile, provenance, and active status (Admin only).
 */
router.patch("/suppliers/:id", authGuard, requireAdmin, updateSupplier);

/**
 * POST /api/admin/offers
 * Create supplier offer (Admin or assigned Supplier).
 */
router.post("/offers", authGuard, requireAdminOrSupplier, createOffer);

/**
 * PATCH /api/admin/offers/:id
 * Update supplier offer details, pricing tiers, and validity (Admin or assigned Supplier).
 */
router.patch("/offers/:id", authGuard, requireAdminOrSupplier, updateOffer);

// ─────────────────────────────────────────────────────────────────────────────
// Reconciliation & Immutability APIs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/reconciliation
 * Surfaces stalled pools, expired quotes, attention payments, failed refunds, and failed AI logs.
 * Accessible to Admin and read-only Reviewers.
 */
router.get("/reconciliation", authGuard, requireAdminOrReviewer, getReconciliationDashboard);

/**
 * POST /api/admin/reconciliation/:paymentId/annotate
 * Enforces Rule FR-ADMIN-005:
 * Adds reconciliation notes and optional sync, protecting immutable captured facts (Admin only).
 */
router.post(
  "/reconciliation/:paymentId/annotate",
  authGuard,
  requireAdmin,
  annotatePayment
);

// ─────────────────────────────────────────────────────────────────────────────
// Audit Log & Background Jobs APIs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/audit-logs
 * Queries immutable audit trail records with filters and pagination (Admin & Reviewer).
 */
router.get("/audit-logs", authGuard, requireAdminOrReviewer, getAuditLogs);
router.get("/ai-logs", authGuard, requireAdminOrReviewer, getAILogs);

/**
 * POST /api/admin/jobs/run-lifecycle-check
 * Evaluates 72h pool deadlines and 24h decision cutoffs (Admin only).
 */
router.post("/jobs/run-lifecycle-check", authGuard, requireAdmin, runLifecycleCheck);
router.post("/reset-under-moq-pool", authGuard, requireAdmin, resetUnderMoqPool);

export default router;
