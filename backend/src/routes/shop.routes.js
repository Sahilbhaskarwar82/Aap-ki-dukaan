import { Router } from "express";
import { getMyShop, updateMyShop, getShopById } from "../controllers/shop.controller.js";
import { authenticateJWT, requireRoles } from "../middleware/auth.middleware.js";

const router = Router();

// All shop routes require authentication
router.use(authenticateJWT);

router.get("/me", requireRoles("SHOP_OWNER", "ADMIN"), getMyShop);
router.patch("/me", requireRoles("SHOP_OWNER"), updateMyShop);
router.get("/:shopId", getShopById);

export default router;

