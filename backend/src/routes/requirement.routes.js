import { Router } from "express";
import {
  createRequirement,
  listRequirements,
  getRequirementById,
  updateRequirement,
  confirmRequirement,
  rejectRequirement,
  importCsvRequirements,
  extractRequirementById,
  getRequirementMatches,
} from "../controllers/requirement.controller.js";
import { documentUploadMiddleware } from "../middleware/upload.middleware.js";
import { verifyJWT } from "../middleware/auth.middleware.js";

/**
 * Task SAH-02: Requirement Routes
 *
 * Exposes:
 * - POST /api/requirements: Create requirement draft
 * - GET /api/requirements: List requirements with filtering & pagination
 * - POST /api/requirements/import-csv: Bulk CSV import from file or JSON payload
 * - GET /api/requirements/:id: Retrieve individual requirement details
 * - PATCH /api/requirements/:id: Edit requirement, update status, and enforce Rule BR-001 on confirmation
 * - PATCH /api/requirements/:id/confirm: Confirm requirement (enforces Rule BR-001)
 * - PATCH /api/requirements/:id/reject: Reject a requirement
 */

const router = Router();

// Development authentication stub (allows dev/testing before JWT middleware runs)
function devAuthStub(req, _res, next) {
  if (!req.user && process.env.NODE_ENV !== "production") {
    req.user = req.user ?? null;
    req.shop = req.shop ?? null;
  }
  next();
}

/**
 * authGuard: Runs verifyJWT when a Bearer token or cookie is present;
 * falls back to devAuthStub in non-production without a token.
 * Mirrors the pattern used in order.routes.js.
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
  return devAuthStub(req, res, next);
}

router.use(devAuthStub);

// Handler supporting both multipart CSV file upload and JSON body
const conditionalCsvUpload = (req, res, next) => {
  const contentType = req.headers["content-type"] || "";
  if (contentType.includes("multipart/form-data")) {
    return documentUploadMiddleware("file")(req, res, next);
  }
  next();
};

router.post("/", authGuard, createRequirement);
router.get("/", authGuard, listRequirements);
router.post("/import-csv", authGuard, conditionalCsvUpload, importCsvRequirements);
router.get("/:id", authGuard, getRequirementById);
router.patch("/:id", authGuard, updateRequirement);
// Dedicated confirm and reject sub-routes — called by confirmRequirement() and rejectRequirement() in requirements.api.js
router.patch("/:id/confirm", authGuard, confirmRequirement);
router.patch("/:id/reject", authGuard, rejectRequirement);
router.post("/:id/extract", authGuard, extractRequirementById);
router.get("/:id/matches", authGuard, getRequirementMatches);

export default router;
