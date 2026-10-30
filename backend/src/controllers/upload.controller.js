import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import mongoose from "mongoose";
import { UploadedDocument } from "../models/UploadedDocument.model.js";
import { PRIVATE_UPLOAD_DIR } from "../middleware/upload.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { APIResponse } from "../utils/apiResponse.js";
import { ApiError } from "../utils/apiError.js";

/**
 * Computes SHA-256 checksum of a file on disk
 * @param {string} filePath 
 * @returns {Promise<string>}
 */
async function computeSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", (err) => reject(err));
  });
}

/**
 * Task SAH-01: POST /api/uploads
 * 
 * Handles single file upload, computes sha256 checksum, sets retention period,
 * and records document provenance in MongoDB.
 */
export const uploadDocument = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, "No file provided for upload.");
  }

  const { path: filePath, originalname, filename: storageKey, mimetype, size } = req.file;

  try {
    // 1. Calculate file integrity hash
    const sha256Hash = await computeSha256(filePath);

    // 2. Derive user and shop ownership from authenticated context or fallback body
    const uploadedByUserId =
      req.user?._id ||
      req.body.uploadedByUserId ||
      new mongoose.Types.ObjectId("000000000000000000000001");

    const shopId =
      req.user?.shopId ||
      req.shop?._id ||
      req.body.shopId ||
      new mongoose.Types.ObjectId("000000000000000000000002");

    // 3. Document retention policy: 90 days default
    const retentionDays = parseInt(process.env.DOCUMENT_RETENTION_DAYS || "90", 10);
    const retentionExpiresAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);

    // 4. Save metadata record to MongoDB
    const document = await UploadedDocument.create({
      uploadedByUserId,
      shopId,
      originalFilename: originalname,
      storageKey,
      storageMode: "LOCAL",
      mimeType: mimetype,
      sizeBytes: size,
      sha256Hash,
      status: "STORED",
      retentionExpiresAt,
    });

    return res.status(201).json(
      new APIResponse(
        201,
        document,
        "Document uploaded and verified successfully."
      )
    );
  } catch (error) {
    // Ensure failed upload does not leave orphaned files on disk
    await fsp.unlink(filePath).catch(() => {});
    throw error;
  }
});

/**
 * Task SAH-01: GET /api/uploads/:id/download
 * 
 * Streams file from private storage with path-traversal defense
 * and stubbed ownership verification.
 */
export const downloadDocument = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid document ID format.");
  }

  const document = await UploadedDocument.findById(id);
  if (!document) {
    throw new ApiError(404, "Uploaded document record not found.");
  }

  // Ownership verification guard (stubbed for req.user integration with PRK-03)
  if (req.user) {
    const isOwner =
      req.user._id && document.uploadedByUserId.equals(req.user._id);
    const isShopOwner =
      req.user.shopId && document.shopId.equals(req.user.shopId);
    const isPrivileged = ["ADMIN", "REVIEWER"].includes(req.user.role);

    if (!isOwner && !isShopOwner && !isPrivileged) {
      throw new ApiError(
        403,
        "Forbidden: You do not have permission to access or download this document."
      );
    }
  }

  // Path traversal defense: ensure target file is strictly inside PRIVATE_UPLOAD_DIR
  const safeFilePath = path.resolve(PRIVATE_UPLOAD_DIR, document.storageKey);
  const relativePath = path.relative(PRIVATE_UPLOAD_DIR, safeFilePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new ApiError(403, "Security violation: Path traversal attempt detected.");
  }

  // Ensure file exists on storage disk
  if (!fs.existsSync(safeFilePath)) {
    throw new ApiError(404, "Document file is missing from private storage.");
  }

  // Set protective response headers
  res.setHeader("Content-Type", document.mimeType);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(document.originalFilename)}"`
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");

  // Stream document securely to client
  const fileStream = fs.createReadStream(safeFilePath);
  fileStream.on("error", (streamErr) => {
    if (!res.headersSent) {
      res.status(500).json(new ApiError(500, `Stream read failure: ${streamErr.message}`));
    }
  });

  fileStream.pipe(res);
});

/**
 * GET /api/uploads/:id
 * 
 * Retrieves metadata for an uploaded document record.
 */
export const getDocumentMetadata = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid document ID format.");
  }

  const document = await UploadedDocument.findById(id).lean();
  if (!document) {
    throw new ApiError(404, "Document record not found.");
  }

  return res.status(200).json(
    new APIResponse(200, document, "Document metadata retrieved successfully.")
  );
});

