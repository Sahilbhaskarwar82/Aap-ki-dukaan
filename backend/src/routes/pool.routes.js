import { Router } from "express";
import {
  handleCreatePool,
  handleListPools,
  handleGetPoolDetail,
  handleJoinPool,
  handleUpdateQuantity,
  handleWithdraw,
  handleApproveSnapshot,
} from "../controllers/pool.controller.js";
import { authenticateJWT, requireRoles } from "../middleware/auth.middleware.js";

const router = Router();

// Public discovery endpoints
router.get("/", handleListPools);
router.get("/:poolId", handleGetPoolDetail);

// Protected mutation endpoints
router.post("/", authenticateJWT, requireRoles("SHOP_OWNER", "ADMIN", "SUPPLIER"), handleCreatePool);
router.post("/:poolId/join", authenticateJWT, requireRoles("SHOP_OWNER"), handleJoinPool);
router.patch(
  "/:poolId/contributions/:contributionId",
  authenticateJWT,
  requireRoles("SHOP_OWNER"),
  handleUpdateQuantity
);
router.post(
  "/:poolId/contributions/:contributionId/withdraw",
  authenticateJWT,
  requireRoles("SHOP_OWNER"),
  handleWithdraw
);
router.post("/:poolId/approve", authenticateJWT, requireRoles("SHOP_OWNER"), handleApproveSnapshot);

export default router;

