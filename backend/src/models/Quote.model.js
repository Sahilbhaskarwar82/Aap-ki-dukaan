import mongoose from "mongoose";

/**
 * Task SAH-09: Quote Model
 *
 * Encapsulates custom and revised wholesale supplier quote requests & responses:
 * - Allows shop owners/admins to request quotes when no compatible offer exists,
 *   a quote is stale, or a pool locks below wholesale MOQ_W.
 * - Allows suppliers/admins to submit binding prices, shipping terms, validity timestamps,
 *   and sub-MOQ feasibility terms.
 *
 * Adheres to mongodb-schema-design & mongoose-optimization:
 * - Integer minor units (paise/cents) for unitPriceMinor and shippingCostMinor.
 * - Compound indexes on (supplierId, status, createdAt) and (requestedByUserId, status, createdAt).
 * - Index on (validUntil, status) for high-performance quote freshness and expiration checks.
 */

export const QUOTE_STATUSES = [
  "REQUESTED",
  "PROVIDED",
  "ACCEPTED",
  "EXPIRED",
  "REJECTED",
];

export const QUOTE_REQUEST_REASONS = [
  "NO_COMPATIBLE_OFFER",
  "STALE_QUOTE",
  "UNDER_MOQ_POOL",
  "CUSTOM_SPECS",
  "VOLUME_DISCOUNT",
  "OTHER",
];

export const QUOTE_SOURCES = [
  "BUYER_REQUEST",
  "UNDER_MOQ_AUTO_TRIGGER",
  "ADMIN_INITIATED",
  "SUPPLIER_REVISION",
];

const quantityTierSchema = new mongoose.Schema(
  {
    minQuantity: {
      type: Number,
      required: [true, "Tier minQuantity is required."],
      min: [1, "Tier minimum quantity must be at least 1."],
    },
    maxQuantity: {
      type: Number,
      default: null,
    },
    unitPriceMinor: {
      type: Number,
      required: [true, "Tier unit price in minor currency units is required."],
      min: [1, "Tier unit price must be greater than zero."],
    },
  },
  { _id: false }
);

const subMoqTermsSchema = new mongoose.Schema(
  {
    acceptsSubMoq: { type: Boolean, default: false },
    minSubMoqQuantity: { type: Number, default: null },
    surchargeMinor: { type: Number, default: 0, min: 0 },
    supplierNotes: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const quoteSchema = new mongoose.Schema(
  {
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: [true, "Supplier reference is required."],
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "Product reference is required."],
      index: true,
    },
    supplierOfferId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SupplierOffer",
      default: null,
      index: true,
    },
    poolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GroupBuyPool",
      default: null,
      index: true,
    },
    requirementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Requirement",
      default: null,
      index: true,
    },
    requestedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Requesting user reference is required."],
      index: true,
    },
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shop",
      default: null,
      index: true,
    },

    // Request Parameters
    requestedQuantity: {
      type: Number,
      required: [true, "Requested quantity is required."],
      min: [1, "Requested quantity must be at least 1."],
    },
    deliveryArea: {
      type: String,
      required: [true, "Delivery area is required."],
      uppercase: true,
      trim: true,
    },
    targetDeliveryDate: {
      type: Date,
      default: null,
    },
    requestReason: {
      type: String,
      enum: QUOTE_REQUEST_REASONS,
      default: "NO_COMPATIBLE_OFFER",
    },
    requestNotes: {
      type: String,
      trim: true,
      default: "",
      maxlength: [1000, "Request notes cannot exceed 1000 characters."],
    },

    // Supplier Quoted Terms (Populated when supplier responds)
    currency: {
      type: String,
      required: true,
      default: "INR",
      enum: ["INR", "USD"],
    },
    unitPriceMinor: {
      type: Number,
      default: null,
      min: [1, "Unit price must be positive integer minor units."],
    },
    quantityTiers: {
      type: [quantityTierSchema],
      default: [],
    },
    shippingCostMinor: {
      type: Number,
      default: null,
      min: [0, "Shipping cost cannot be negative."],
    },
    shippingTerms: {
      type: String,
      enum: ["EX_WORKS", "DELIVERED_DUTY_PAID", "FREE_SHIPPING", "CUSTOM_FREIGHT"],
      default: "EX_WORKS",
    },
    taxInclusion: {
      type: String,
      enum: ["GST_INCLUDED", "GST_EXCLUDED", "TAX_PENDING"],
      default: "GST_EXCLUDED",
    },
    leadTimeDays: {
      type: Number,
      default: 3,
      min: [1, "Lead time must be at least 1 business day."],
    },
    validUntil: {
      type: Date,
      default: null,
      index: true,
    },
    subMoqTerms: {
      type: subMoqTermsSchema,
      default: () => ({}),
    },

    // Quote Lifecycle State
    status: {
      type: String,
      enum: QUOTE_STATUSES,
      default: "REQUESTED",
      required: true,
      index: true,
    },
    source: {
      type: String,
      enum: QUOTE_SOURCES,
      default: "BUYER_REQUEST",
      required: true,
    },
    respondedAt: {
      type: Date,
      default: null,
    },
    respondedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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

// ─────────────────────────────────────────────────────────────────────────────
// Indexes for Optimized Query Performance
// ─────────────────────────────────────────────────────────────────────────────

// Fast lookup for supplier inbox (pending, provided, expired)
quoteSchema.index({ supplierId: 1, status: 1, createdAt: -1 });

// Fast lookup for retailer/buyer quote history
quoteSchema.index({ requestedByUserId: 1, status: 1, createdAt: -1 });

// Fast lookup for pool-associated revised quotes
quoteSchema.index({ poolId: 1, status: 1 });

// Expiration tracking
quoteSchema.index({ validUntil: 1, status: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// Virtual Properties
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Checks whether this quote has passed its validity timestamp.
 */
quoteSchema.virtual("isExpired").get(function () {
  if (this.status === "EXPIRED") return true;
  if (!this.validUntil) return false;
  return new Date(this.validUntil) <= new Date();
});

/**
 * Total estimated landed cost in minor currency units (merchandise + known shipping).
 */
quoteSchema.virtual("landedCostMinor").get(function () {
  if (!this.unitPriceMinor) return null;
  const merchandise = this.unitPriceMinor * this.requestedQuantity;
  return merchandise + (this.shippingCostMinor || 0);
});

export const Quote = mongoose.model("Quote", quoteSchema);
export default Quote;

