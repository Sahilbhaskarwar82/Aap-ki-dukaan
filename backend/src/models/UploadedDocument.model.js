import mongoose from "mongoose";

/**
 * Task SAH-01: UploadedDocument Model
 * 
 * Manages metadata and security provenance for private business documents
 * (invoices, rate cards, requirement docs) uploaded by shop owners or suppliers.
 * 
 * Follows mongodb-schema-design and mongoose-optimization best practices:
 * - Foreign keys indexed for fast relation lookup.
 * - Compound index on { shopId: 1, status: 1 } for scoped filtering.
 * - TTL-ready retention expiration index on retentionExpiresAt.
 * - Strict enum enforcement for MIME types and processing lifecycle states.
 */
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/csv",
];

const DOCUMENT_STATUSES = [
  "STORED",
  "PROCESSING",
  "PROCESSED",
  "ARCHIVED",
  "FAILED_VALIDATION",
  "DELETED",
];

const uploadedDocumentSchema = new mongoose.Schema(
  {
    uploadedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Uploaded by user ID is required."],
      index: true,
    },
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shop",
      required: [true, "Shop ID is required."],
      index: true,
    },
    originalFilename: {
      type: String,
      required: [true, "Original filename is required."],
      trim: true,
      maxlength: [255, "Filename cannot exceed 255 characters."],
    },
    storageKey: {
      type: String,
      required: [true, "Unique storage key (UUID) is required."],
      unique: true,
      trim: true,
      index: true,
    },
    storageMode: {
      type: String,
      enum: ["LOCAL", "OBJECT_STORAGE"],
      default: "LOCAL",
      required: true,
    },
    mimeType: {
      type: String,
      required: [true, "MIME type is required."],
      enum: {
        values: ALLOWED_MIME_TYPES,
        message: "{VALUE} is not a supported file type.",
      },
    },
    sizeBytes: {
      type: Number,
      required: [true, "File size in bytes is required."],
      min: [1, "File cannot be empty."],
      max: [10 * 1024 * 1024, "File size cannot exceed 10MB (10,485,760 bytes)."],
    },
    sha256Hash: {
      type: String,
      required: [true, "SHA-256 integrity hash is required."],
      trim: true,
      length: 64,
    },
    status: {
      type: String,
      enum: {
        values: DOCUMENT_STATUSES,
        message: "{VALUE} is not a valid document status.",
      },
      default: "STORED",
      required: true,
      index: true,
    },
    retentionExpiresAt: {
      type: Date,
      required: [true, "Retention expiration date is required."],
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// Compound indexes for optimal query execution (mongoose-optimization)
uploadedDocumentSchema.index({ shopId: 1, status: 1, createdAt: -1 });
uploadedDocumentSchema.index({ uploadedByUserId: 1, createdAt: -1 });

// Helper virtual to check if document retention has expired
uploadedDocumentSchema.virtual("isExpired").get(function () {
  return this.retentionExpiresAt && new Date() > this.retentionExpiresAt;
});

export const UploadedDocument = mongoose.model(
  "UploadedDocument",
  uploadedDocumentSchema
);

export default UploadedDocument;

