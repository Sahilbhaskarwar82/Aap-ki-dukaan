import { Router } from "express";
import {
  listSuppliers,
  getSupplierById,
  searchProducts,
  searchOffers,
  compareOffers,
  getMySupplierProfile,
  updateMySupplierProfile,
} from "../controllers/supplier.controller.js";
import { verifyJWT, verifyRole } from "../middleware/auth.middleware.js";

/**
 * Task SAH-05 & SAH-07: Supplier & Catalogue Routes
 *
 * Exposes:
 * - GET /api/suppliers/me: Authenticated self-service supplier profile
 * - PATCH /api/suppliers/me: Authenticated self-service supplier profile update
 * - GET /api/suppliers: Search & list wholesale suppliers
 * - GET /api/suppliers/products/search: Catalogue product search (also mounted at /api/products/search)
 * - GET /api/suppliers/offers/search: Live supplier offer search (also mounted at /api/offers/search)
 * - POST /api/offers/compare: Deterministic landed-cost comparison & AI trade-off summary (Task SAH-07)
 * - GET /api/suppliers/:id: Retrieve individual supplier by ID
 */

const router = Router();

// Dedicated sub-routers for top-level /api/products and /api/offers mounting
export const productRouter = Router();
productRouter.get("/search", searchProducts);

export const offerRouter = Router();
offerRouter.get("/search", searchOffers);
offerRouter.post("/compare", compareOffers);

// Combined routes under /api/suppliers
router.get("/products/search", searchProducts);
router.get("/offers/search", searchOffers);
router.post("/offers/compare", compareOffers);

// Authenticated self-service supplier profile endpoints (must precede /:id)
router.get("/me", verifyJWT, verifyRole("SUPPLIER", "ADMIN"), getMySupplierProfile);
router.patch("/me", verifyJWT, verifyRole("SUPPLIER", "ADMIN"), updateMySupplierProfile);

router.get("/:id", getSupplierById);
router.get("/", listSuppliers);

export default router;
