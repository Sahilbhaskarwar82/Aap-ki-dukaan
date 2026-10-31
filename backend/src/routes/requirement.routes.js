import { Router } from "express";
import {
  createRequirement,
  listRequirements,
  getRequirementById,
  updateRequirement,
  importCsvRequirements,
  extractRequirementById,
  getRequirementMatches,
} from "../controllers/requirement.controller.js";
import { documentUploadMiddleware } from "../middleware/upload.middleware.js";

/**
 * Task SAH-02: Requirement Routes
 *
 * Exposes:
 * - POST /api/requirements: Create requirement draft
 * - GET /api/requirements: List requirements with filtering & pagination
 * - POST /api/requirements/import-csv: Bulk CSV import from file or JSON payload
 * - GET /api/requirements/:id: Retrieve individual requirement details
 * - PATCH /api/requirements/:id: Edit requirement, update status, and enforce Rule BR-001 on confirmation
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

router.use(devAuthStub);

// Handler supporting both multipart CSV file upload and JSON body
const conditionalCsvUpload = (req, res, next) => {
  const contentType = req.headers["content-type"] || "";
  if (contentType.includes("multipart/form-data")) {
    return documentUploadMiddleware("file")(req, res, next);
  }
  next();
};

router.post("/", createRequirement);
router.get("/", listRequirements);
router.post("/import-csv", conditionalCsvUpload, importCsvRequirements);
router.get("/:id", getRequirementById);
router.patch("/:id", updateRequirement);
router.post("/:id/extract", extractRequirementById);
router.get("/:id/matches", getRequirementMatches);

export default router;

