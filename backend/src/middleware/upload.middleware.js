import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import multer from "multer";
import { ApiError } from "../utils/apiError.js";

/**
 * Task SAH-01: Secure Document Upload Middleware
 * 
 * Applies secure-file-handling best practices:
 * 1. Storage in a private, non-public directory (`./private_uploads/`).
 * 2. Randomized UUID filename generation (`crypto.randomUUID()`) to prevent
 *    path traversal, directory climbing, and filename collision attacks.
 * 3. Strict allowlist file filter checking declared MIME types and allowed extensions.
 * 4. Hard file-size ceiling: 10MB (10 * 1024 * 1024 bytes).
 * 5. Deep magic-bytes validation verifying file header signature against the declared MIME.
 * 6. Automatic disk cleanup (unlink) upon verification failure.
 */

// Private upload storage location outside of public web root
export const PRIVATE_UPLOAD_DIR = path.resolve(
  process.env.UPLOAD_DIR || "./private_uploads"
);

// Ensure storage directory exists securely on startup
if (!fs.existsSync(PRIVATE_UPLOAD_DIR)) {
  fs.mkdirSync(PRIVATE_UPLOAD_DIR, { recursive: true });
}

// 10 MB maximum upload limit in bytes
export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

// Permitted MIME types mapped to valid file extensions
export const ALLOWED_MIME_MAP = Object.freeze({
  "application/pdf": [".pdf"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
  "text/csv": [".csv"],
});

// Forbidden/dangerous extensions (prevent script & executable execution)
const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".sh", ".bash", ".zsh", ".bin",
  ".js", ".mjs", ".cjs", ".ts", ".html", ".htm", ".xhtml",
  ".php", ".phtml", ".py", ".rb", ".pl", ".vbs", ".dll", ".so",
  ".msi", ".jar", ".app", ".scr", ".com", ".ps1"
]);

/**
 * Secure Multer disk storage engine
 * Renames files to safe UUIDs, preserving only the verified extension.
 */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, PRIVATE_UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeUUID = crypto.randomUUID();
    const storageKey = `${safeUUID}${ext}`;
    cb(null, storageKey);
  },
});

/**
 * Stage 1 Filter: Verifies declared MIME type and file extension
 */
const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExtensions = ALLOWED_MIME_MAP[file.mimetype];

  // Check extension against malicious executable blacklist
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return cb(
      new ApiError(
        400,
        `Security violation: Executable or script file extension '${ext}' is strictly prohibited.`
      ),
      false
    );
  }

  // Check MIME type allowlist
  if (!allowedExtensions) {
    return cb(
      new ApiError(
        400,
        `Unsupported file type '${file.mimetype}'. Only PDF, PNG, JPEG, WEBP, and CSV files are allowed.`
      ),
      false
    );
  }

  // Cross-verify extension matches declared MIME type
  if (!allowedExtensions.includes(ext)) {
    return cb(
      new ApiError(
        400,
        `File extension '${ext}' does not match declared MIME type '${file.mimetype}'.`
      ),
      false
    );
  }

  cb(null, true);
};

const multerInstance = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_UPLOAD_SIZE_BYTES,
    files: 1, // Only 1 document per request
  },
});

/**
 * Stage 2 Defense: Magic Byte Header Validation
 * Reads the initial bytes from disk to ensure the binary structure matches the MIME type.
 * Eliminates spoofed extension attacks (e.g. malicious executable renamed to `.pdf`).
 *
 * @param {string} filePath - Absolute path to stored file
 * @param {string} mimeType - Declared MIME type
 * @returns {Promise<boolean>}
 */
export async function verifyMagicBytes(filePath, mimeType) {
  let fileHandle;
  try {
    fileHandle = await fsp.open(filePath, "r");
    const buffer = Buffer.alloc(16);
    const { bytesRead } = await fileHandle.read(buffer, 0, 16, 0);

    if (bytesRead < 4) {
      return false;
    }

    switch (mimeType) {
      case "application/pdf":
        // PDF magic header: %PDF (0x25 0x50 0x44 0x46)
        return buffer.subarray(0, 4).toString("ascii") === "%PDF";

      case "image/png":
        // PNG magic header: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
        return (
          buffer[0] === 0x89 &&
          buffer[1] === 0x50 &&
          buffer[2] === 0x4e &&
          buffer[3] === 0x47 &&
          buffer[4] === 0x0d &&
          buffer[5] === 0x0a &&
          buffer[6] === 0x1a &&
          buffer[7] === 0x0a
        );

      case "image/jpeg":
        // JPEG magic header: 0xFF 0xD8 0xFF
        return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

      case "image/webp":
        // WEBP: "RIFF" at offset 0, "WEBP" at offset 8
        return (
          buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
          buffer.subarray(8, 12).toString("ascii") === "WEBP"
        );

      case "text/csv": {
        // CSV: Plain text characters without binary null bytes
        for (let i = 0; i < bytesRead; i++) {
          if (buffer[i] === 0x00) return false;
        }
        return true;
      }

      default:
        return false;
    }
  } finally {
    if (fileHandle) {
      await fileHandle.close();
    }
  }
}

/**
 * Express Middleware: Single document upload handler with strict error mapping
 * and automatic magic-byte verification.
 */
export function documentUploadMiddleware(fieldName = "document") {
  const uploadSingle = multerInstance.single(fieldName);

  return (req, res, next) => {
    uploadSingle(req, res, async (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === "LIMIT_FILE_SIZE") {
            return next(
              new ApiError(
                400,
                `File size exceeds maximum permitted limit of 10MB (${MAX_UPLOAD_SIZE_BYTES} bytes).`
              )
            );
          }
          if (err.code === "LIMIT_UNEXPECTED_FILE") {
            return next(
              new ApiError(
                400,
                `Unexpected upload field '${err.field}'. Expected field '${fieldName}'.`
              )
            );
          }
          return next(new ApiError(400, `Upload error: ${err.message}`));
        }
        return next(err);
      }

      // Check if file was provided
      if (!req.file) {
        return next(new ApiError(400, `No file uploaded. Please provide a '${fieldName}' file.`));
      }

      // Verify magic bytes
      try {
        const isValid = await verifyMagicBytes(req.file.path, req.file.mimetype);
        if (!isValid) {
          // Immediately purge invalid/spoofed file from disk
          await fsp.unlink(req.file.path).catch(() => {});
          return next(
            new ApiError(
              400,
              `File validation failed: Binary signature does not match declared MIME type '${req.file.mimetype}'.`
            )
          );
        }
      } catch (verificationErr) {
        await fsp.unlink(req.file.path).catch(() => {});
        return next(
          new ApiError(
            500,
            `File integrity check failed: ${verificationErr.message}`
          )
        );
      }

      next();
    });
  };
}

export default documentUploadMiddleware;

