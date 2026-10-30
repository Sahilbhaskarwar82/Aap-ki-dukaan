import { Router } from "express";
import {
  listSuppliers,
  getSupplierById,
  searchProducts,
  searchOffers,
} from "../controllers/supplier.controller.js";

/**
 * Task SAH-05: Supplier & Catalogue Routes
 *
 * Exposes:
 * - GET /api/suppliers: Search & list wholesale suppliers
 * - GET /api/suppliers/products/search: Catalogue product search (also mounted at /api/products/search)
 * - GET /api/suppliers/offers/search: Live supplier offer search (also mounted at /api/offers/search)
 * - GET /api/suppliers/:id: Retrieve individual supplier by ID
 */

const router = Router();

// Dedicated sub-routers for top-level /api/products and /api/offers mounting
export const productRouter = Router();
productRouter.get("/search", searchProducts);

export const offerRouter = Router();
offerRouter.get("/search", searchOffers);

// Combined routes under /api/suppliers
router.get("/products/search", searchProducts);
router.get("/offers/search", searchOffers);
router.get("/:id", getSupplierById);
router.get("/", listSuppliers);

export default router;

