import { Router } from "express";
import {
  handleCreatePool,
  handleListPools,
  handleGetPoolDetail,
  handleJoinPool,
  handleUpdateQuantity,
  handleWithdraw,
  handleApproveSnapshot,
  handleUnderMoqDecision,
  handleSupplierFeasibility,
} from "../controllers/pool.controller.js";
import { verifyJWT, verifyRole } from "../middleware/auth.middleware.js";

const router = Router();

// Public discovery endpoints
router.get("/", handleListPools);
router.get("/:poolId", handleGetPoolDetail);

// Protected mutation endpoints
router.post("/", verifyJWT, verifyRole("SHOP_OWNER", "ADMIN", "SUPPLIER"), handleCreatePool);

// Join pool (supports both /:poolId/join and /:poolId/contributions)
router.post("/:poolId/join", verifyJWT, verifyRole("SHOP_OWNER"), handleJoinPool);
router.post("/:poolId/contributions", verifyJWT, verifyRole("SHOP_OWNER"), handleJoinPool);

// Edit contribution quantity
router.patch(
  "/:poolId/contributions/:contributionId",
  verifyJWT,
  verifyRole("SHOP_OWNER"),
  handleUpdateQuantity
);

// Withdraw contribution (supports both POST /withdraw and DELETE /:contributionId)
router.post(
  "/:poolId/contributions/:contributionId/withdraw",
  verifyJWT,
  verifyRole("SHOP_OWNER"),
  handleWithdraw
);
router.delete(
  "/:poolId/contributions/:contributionId",
  verifyJWT,
  verifyRole("SHOP_OWNER"),
  handleWithdraw
);

// Explicit PriceSnapshot approval
router.post("/:poolId/approve", verifyJWT, verifyRole("SHOP_OWNER"), handleApproveSnapshot);

// 24h Under-MOQ buyer decision (PROCEED / CANCEL)
router.post("/:poolId/decision", verifyJWT, verifyRole("SHOP_OWNER"), handleUnderMoqDecision);

// Supplier under-MOQ feasibility resolution
router.post(
  "/:poolId/supplier-feasibility",
  verifyJWT,
  verifyRole("SUPPLIER", "ADMIN"),
  handleSupplierFeasibility
);

export default router;
