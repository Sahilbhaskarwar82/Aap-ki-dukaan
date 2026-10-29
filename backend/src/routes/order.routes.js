import { Router } from "express";
import {
  getPoSummary,
  getSettlement,
  updateSettlement,
  getOrderById,
  listOrders,
} from "../controllers/order.controller.js";

const router = Router();

function devAuthStub(req, _res, next) {
  if (!req.user && process.env.NODE_ENV !== "production") {
    req.user = req.user ?? null;
    req.shop = req.shop ?? null;
  }
  next();
}

/**
 * Task SRU-06:
 * GET /api/orders/:id/po-summary
 * Downloads printable Purchase Order document (JSON or HTML).
 */
router.get("/:id/po-summary", devAuthStub, getPoSummary);

/**
 * Task SRU-07:
 * GET /api/orders/:id/settlement
 * Retrieves SupplierSettlement record for an order (Admins, Reviewers, assigned Supplier).
 */
router.get("/:id/settlement", devAuthStub, getSettlement);

/**
 * Task SRU-07:
 * PATCH /api/orders/:id/settlement
 * Updates SupplierSettlement status/mode (Admin only).
 */
router.patch("/:id/settlement", devAuthStub, updateSettlement);

/**
 * GET /api/orders/:id
 * Retrieves order details.
 */
router.get("/:id", devAuthStub, getOrderById);

/**
 * GET /api/orders
 * Lists orders for the current user.
 */
router.get("/", devAuthStub, listOrders);

export default router;
