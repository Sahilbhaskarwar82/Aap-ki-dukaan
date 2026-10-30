/**
 * Refund Routes — SRU-04
 *
 * Mounts endpoints under /api/refunds.
 */

import { Router } from "express";
import {
  createRefund,
  triggerTierDropRefunds,
  listRefunds,
  getRefund,
} from "../controllers/refund.controller.js";

const router = Router();

function devAuthStub(req, _res, next) {
  if (!req.user && process.env.NODE_ENV !== "production") {
    req.user = req.user ?? null;
    req.shop = req.shop ?? null;
  }
  next();
}

/**
 * POST /api/refunds/initiate
 *
 * Initiates a full or partial refund against a captured payment.
 */
router.post("/initiate", devAuthStub, createRefund);

/**
 * POST /api/refunds/tier-drop-savings
 *
 * Triggers bulk tier-drop savings refunds for a locked pool.
 */
router.post("/tier-drop-savings", devAuthStub, triggerTierDropRefunds);

/**
 * GET /api/refunds
 *
 * Lists refund history for the authenticated shop profile.
 */
router.get("/", devAuthStub, listRefunds);

/**
 * GET /api/refunds/:id
 *
 * Retrieves a single refund record by ID.
 */
router.get("/:id", devAuthStub, getRefund);

export default router;
