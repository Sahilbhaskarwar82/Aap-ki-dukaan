import { Router } from "express";
import {
  getPoSummary,
  getSettlement,
  updateSettlement,
  getOrderActivity,
  getOrderById,
  listOrders,
  patchSupplierStatus,
  createOrderFromPool,
} from "../controllers/order.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";

const router = Router();

function devAuthStub(req, _res, next) {
  if (!req.user && process.env.NODE_ENV !== "production") {
    req.user = req.user ?? null;
    req.shop = req.shop ?? null;
  }
  next();
}

function authGuard(req, res, next) {
  if (req.user) return next();
  const token =
    req.cookies?.accessToken ||
    req.cookies?.token ||
    req.header("Authorization")?.replace("Bearer ", "");

  if (token) {
    return verifyJWT(req, res, next);
  }
  return devAuthStub(req, res, next);
}

/**
 * Task SRU-05:
 * PATCH /api/orders/:id/supplier-status
 * Wholesaler or Admin confirms, rejects, or updates delivery status.
 */
router.patch("/:id/supplier-status", authGuard, patchSupplierStatus);

/**
 * Task SRU-05:
 * POST /api/orders/from-pool/:poolId
 * Generates final Order from a funded pool.
 */
router.post("/from-pool/:poolId", authGuard, createOrderFromPool);

/**
 * Task SRU-06:
 * GET /api/orders/:id/po-summary
 * Downloads printable Purchase Order document (JSON or HTML).
 */
router.get("/:id/po-summary", authGuard, getPoSummary);

/**
 * Task SRU-07:
 * GET /api/orders/:id/settlement
 * Retrieves SupplierSettlement record for an order (Admins, Reviewers, assigned Supplier).
 */
router.get("/:id/settlement", authGuard, getSettlement);

/**
 * Task SRU-07:
 * PATCH /api/orders/:id/settlement
 * Updates SupplierSettlement status/mode (Admin only).
 */
router.patch("/:id/settlement", authGuard, updateSettlement);

/**
 * Task SRU-09:
 * GET /api/orders/:id/activity
 * Retrieves chronological audit activity timeline for an order.
 */
router.get("/:id/activity", authGuard, getOrderActivity);

/**
 * GET /api/orders/:id
 * Retrieves order details.
 */
router.get("/:id", authGuard, getOrderById);

/**
 * GET /api/orders
 * Lists orders for the current user.
 */
router.get("/", authGuard, listOrders);

export default router;
