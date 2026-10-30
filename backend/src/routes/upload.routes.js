import { Router } from "express";
import {
  uploadDocument,
  downloadDocument,
  getDocumentMetadata,
} from "../controllers/upload.controller.js";
import { documentUploadMiddleware } from "../middleware/upload.middleware.js";

/**
 * Task SAH-01: Document Upload Routes
 * 
 * Exposes:
 * - POST /api/uploads: Upload document with strict validation, magic-byte inspection & metadata persistence
 * - GET /api/uploads/:id: Fetch document provenance & metadata
 * - GET /api/uploads/:id/download: Download file with ownership guard and path-traversal protection
 */
const router = Router();

// Development authentication stub (populated when PRK-03 JWT middleware merges)
function devAuthStub(req, _res, next) {
  if (!req.user && process.env.NODE_ENV !== "production") {
    req.user = req.user ?? null;
    req.shop = req.shop ?? null;
  }
  next();
}

router.use(devAuthStub);

router.post("/", documentUploadMiddleware("document"), uploadDocument);
router.get("/:id", getDocumentMetadata);
router.get("/:id/download", downloadDocument);

export default router;

