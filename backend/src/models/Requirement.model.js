import mongoose from "mongoose";
import "./UploadedDocument.model.js";

/**
 * Task SAH-02: Requirement Model
 *
 * Stores shop purchasing requirements across their intake lifecycle.
 *
 * Implements strict separation between:
 * - `extractedFields`: Unverified AI output from document OCR/NLP extractions (Task SAH-04).
 * - `confirmedFields`: User-reviewed, legally binding purchasing attributes.
 *
 * Adheres to mongodb-schema-design & mongoose-optimization:
 * - Compound index on { shopId: 1, status: 1, createdAt: -1 } for shop-scoped views.
 * - Flattened, indexed top-level fields populated upon confirmation for high-performance catalogue matching.
 * - Strict enum enforcement across lifecycle statuses and input source types.
 */

export const REQUIREMENT_STATUSES = [
  "DRAFT",
  "PROCESSING",
  "NEEDS_REVIEW",
  "CONFIRMED",
  "FAILED_EXTRACTION",
  "REJECTED",
  "ARCHIVED",
];

export const REQUIREMENT_SOURCE_TYPES = ["FORM", "TEXT", "IMAGE", "PDF", "CSV"];

const requirementAttributeSnapshotSchema = new mongoose.Schema(
  {
    productName: { type: String, trim: true, default: null },
    category: { type: String, trim: true, default: null },
    requestedQuantity: { type: Number, min: 1, default: null },
    quantityUnit: { type: String, trim: true, default: null }, // e.g., "BOX", "CARTON", "BAG", "UNIT"
    packSize: { type: String, trim: true, default: null }, // e.g., "1000 pieces per box"
    material: { type: String, trim: true, default: null }, // e.g., "Food-safe PE-lined paper"
    capacityOrSize: { type: String, trim: true, default: null }, // e.g., "12 oz (350ml)"
    foodSafeRequired: { type: Boolean, default: null },
    brandConstraint: { type: String, trim: true, default: null },
    requiredBy: { type: Date, default: null },
    deliveryArea: { type: String, trim: true, default: null },
    additionalSpecifications: { type: Map, of: String, default: {} },
  },
  { _id: false }
);

const requirementSchema = new mongoose.Schema(
  {
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shop",
      required: [true, "Shop reference is required."],
      index: true,
    },
    createdByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Creator user reference is required."],
      index: true,
    },
    sourceType: {
      type: String,
      enum: {
        values: REQUIREMENT_SOURCE_TYPES,
        message: "{VALUE} is not a valid requirement source type.",
      },
      default: "FORM",
      required: true,
    },
    originalDescription: {
      type: String,
      trim: true,
      maxlength: [5000, "Description cannot exceed 5000 characters."],
      default: "",
    },
    uploadedDocumentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UploadedDocument",
      default: null,
      index: true,
    },

    // AI-Extracted Output (Untrusted until shop owner explicitly reviews & confirms)
    extractedFields: {
      type: requirementAttributeSnapshotSchema,
      default: () => ({}),
    },

    // Authoritative User-Reviewed & Confirmed Purchasing Specifications
    confirmedFields: {
      type: requirementAttributeSnapshotSchema,
      default: () => ({}),
    },

    // Flattened top-level indexed fields populated upon transition to CONFIRMED (Rule BR-001)
    productName: { type: String, trim: true, index: true, default: null },
    category: { type: String, trim: true, uppercase: true, index: true, default: null },
    requestedQuantity: { type: Number, min: 1, default: null },
    quantityUnit: { type: String, trim: true, uppercase: true, default: null },
    packSize: { type: String, trim: true, default: null },
    requiredBy: { type: Date, default: null },
    deliveryArea: { type: String, trim: true, uppercase: true, index: true, default: null },

    uncertainFields: [{ type: String, trim: true }],
    confidenceScore: { type: Number, min: 0, max: 1, default: null },
    extractionNotes: { type: String, default: null },

    status: {
      type: String,
      enum: {
        values: REQUIREMENT_STATUSES,
        message: "{VALUE} is not a valid requirement status.",
      },
      default: "DRAFT",
      required: true,
      index: true,
    },

    confirmedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    confirmedAt: {
      type: Date,
      default: null,
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

// Compound index for shop-scoped views and status filtering
requirementSchema.index({ shopId: 1, status: 1, createdAt: -1 });

export const Requirement = mongoose.model("Requirement", requirementSchema);
export default Requirement;

