import mongoose from "mongoose";

/**
 * Task SAH-05: Supplier Model
 *
 * Stores wholesale suppliers, commercial distributors, and verified manufacturers.
 *
 * Follows mongodb-schema-design and mongoose-optimization:
 * - Multi-key index on serviceAreas for delivery zone routing.
 * - Compound index on { activeStatus: 1, verificationStatus: 1, serviceAreas: 1 } for fast catalogue discovery.
 * - Strict provenance tracking via dataSourceType ('SEEDED_DEMO', 'SUPPLIER_SUBMITTED', 'VERIFIED_LIVE', 'EXTERNAL_API').
 */

export const SUPPLIER_VERIFICATION_STATUSES = [
  "VERIFIED",
  "UNVERIFIED",
  "DEMO_ONLY",
  "UNDER_REVIEW",
];

export const SUPPLIER_ACTIVE_STATUSES = ["ACTIVE", "INACTIVE", "SUSPENDED"];

export const DATA_SOURCE_TYPES = [
  "SEEDED_DEMO",
  "SUPPLIER_SUBMITTED",
  "VERIFIED_LIVE",
  "EXTERNAL_API",
];

const contactReferenceSchema = new mongoose.Schema(
  {
    contactPerson: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, lowercase: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const supplierSchema = new mongoose.Schema(
  {
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Supplier company name is required."],
      trim: true,
      maxlength: [160, "Supplier name cannot exceed 160 characters."],
      index: true,
    },
    contactReference: {
      type: contactReferenceSchema,
      default: () => ({}),
    },
    serviceAreas: [
      {
        type: String,
        required: [true, "At least one service area is required."],
        trim: true,
        uppercase: true,
        index: true,
      },
    ],
    verificationStatus: {
      type: String,
      enum: {
        values: SUPPLIER_VERIFICATION_STATUSES,
        message: "{VALUE} is not a valid verification status.",
      },
      default: "DEMO_ONLY",
      required: true,
      index: true,
    },
    activeStatus: {
      type: String,
      enum: {
        values: SUPPLIER_ACTIVE_STATUSES,
        message: "{VALUE} is not a valid active status.",
      },
      default: "ACTIVE",
      required: true,
      index: true,
    },
    dataSourceType: {
      type: String,
      enum: {
        values: DATA_SOURCE_TYPES,
        message: "{VALUE} is not a valid data source type.",
      },
      default: "SEEDED_DEMO",
      required: true,
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

// Compound index for active supplier filtering by regional delivery zones
supplierSchema.index({ activeStatus: 1, verificationStatus: 1, serviceAreas: 1 });

export const Supplier = mongoose.model("Supplier", supplierSchema);
export default Supplier;

