import mongoose from "mongoose";

/**
 * Task SAH-05: SupplierOffer Model
 *
 * Encapsulates wholesaler catalogue offers, tier pricing, and the core
 * Two-Level MOQ & Step Multiple procurement rules:
 * - Wholesale MOQ (MOQ_W): minimum total order for the group-buy pool.
 * - Retailer MOQ Percentage (p_min, default 20%): determines individual retailer floor MOQ_R.
 * - Retailer Step Percentage (p_step, default 1%): determines valid order increment multiple Step.
 * - Minor-unit integer financial arithmetic: unitPriceMinor and flatShippingCostMinor in paise/cents.
 */

const quantityTierSchema = new mongoose.Schema(
  {
    minQuantity: {
      type: Number,
      required: [true, "Tier minQuantity is required."],
      min: [1, "Tier minimum quantity must be at least 1."],
    },
    maxQuantity: {
      type: Number,
      default: null, // null represents unbounded top tier
    },
    unitPriceMinor: {
      type: Number,
      required: [true, "Tier unit price in minor currency units (paise) is required."],
      min: [1, "Unit price must be greater than zero."],
    },
  },
  { _id: false }
);

const supplierOfferSchema = new mongoose.Schema(
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
    supplierProductDescription: {
      type: String,
      trim: true,
      default: "",
    },
    packUnit: {
      type: String,
      required: [true, "Pack unit (e.g. BOX, UNIT, CARTON) is required."],
      uppercase: true,
      trim: true,
    },
    packSize: {
      type: String,
      required: [true, "Pack size description is required."],
      trim: true,
    },
    currency: {
      type: String,
      required: true,
      default: "INR",
      enum: ["INR", "USD"],
      uppercase: true,
    },
    baseUnitPriceMinor: {
      type: Number,
      required: [true, "Base unit price in minor units (paise/cents) is required."],
      min: [1, "Price must be at least 1 minor unit."],
    },
    quantityTiers: {
      type: [quantityTierSchema],
      default: [],
    },

    // Wholesaler & Retailer Two-Level MOQ + Step Increment Rules
    minimumOrderQuantity: {
      type: Number,
      required: [true, "Wholesale MOQ (MOQ_W) is required."],
      min: [1, "Wholesale MOQ must be at least 1."],
    },
    retailerMoqPercentage: {
      type: Number,
      required: true,
      min: [1, "Retailer MOQ percentage must be at least 1%."],
      max: [100, "Retailer MOQ percentage cannot exceed 100%."],
      default: 20, // Default: 20% of Wholesale MOQ (e.g., 200 when MOQ_W = 1000)
    },
    retailerStepPercentage: {
      type: Number,
      required: true,
      min: [0.1, "Retailer step percentage must be at least 0.1%."],
      max: [100, "Retailer step percentage cannot exceed 100%."],
      default: 1, // Default: 1% of Wholesale MOQ (e.g., multiple of 10 when MOQ_W = 1000)
    },
    minRetailerQuantityOverride: {
      type: Number,
      min: [1, "Override retailer MOQ must be at least 1."],
      default: null,
    },
    quantityStepMultipleOverride: {
      type: Number,
      min: [1, "Override step multiple must be at least 1."],
      default: null,
    },
    acceptsUnderMoqOrders: {
      type: Boolean,
      default: false,
    },

    deliveryAreas: [
      {
        type: String,
        required: [true, "At least one delivery area is required."],
        trim: true,
        uppercase: true,
        index: true,
      },
    ],
    leadTimeDays: {
      type: Number,
      required: true,
      min: [1, "Lead time must be at least 1 day."],
      default: 3,
    },
    shippingTerms: {
      type: String,
      required: true,
      trim: true,
      default: "EX_WORKS",
    },
    flatShippingCostMinor: {
      type: Number,
      min: [0, "Shipping cost cannot be negative."],
      default: null, // null indicates shipping pending or excluded
    },
    shippingAllocationMethod: {
      type: String,
      enum: ["PER_UNIT", "PER_WEIGHT", "EQUAL_SHARE"],
      default: "PER_UNIT",
    },
    taxInclusion: {
      type: String,
      enum: ["GST_INCLUDED", "GST_EXCLUDED", "TAX_PENDING"],
      default: "GST_EXCLUDED",
    },
    availabilityStatus: {
      type: String,
      enum: ["IN_STOCK", "MADE_TO_ORDER", "LOW_STOCK", "OUT_OF_STOCK"],
      default: "IN_STOCK",
    },
    quoteTimestamp: {
      type: Date,
      required: true,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: [true, "Quote expiration date is required."],
      index: true,
    },
    dataSourceType: {
      type: String,
      enum: ["SEEDED_DEMO", "SUPPLIER_SUBMITTED", "VERIFIED_LIVE", "EXTERNAL_API"],
      default: "SEEDED_DEMO",
      required: true,
      index: true,
    },
    verificationStatus: {
      type: String,
      enum: ["VERIFIED", "UNVERIFIED", "DEMO_SAMPLE"],
      default: "DEMO_SAMPLE",
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
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

// Compound index for active offer discovery and quote freshness
supplierOfferSchema.index({ productId: 1, isActive: 1, expiresAt: 1 });
supplierOfferSchema.index({ supplierId: 1, isActive: 1 });

// Helper virtual: Calculated Retailer Minimum Order Quantity (MOQ_R)
supplierOfferSchema.virtual("computedRetailerMoq").get(function () {
  if (this.minRetailerQuantityOverride != null) {
    return this.minRetailerQuantityOverride;
  }
  return Math.ceil((this.minimumOrderQuantity * this.retailerMoqPercentage) / 100);
});

// Helper virtual: Calculated Retailer Order Step Increment Multiple (Step)
supplierOfferSchema.virtual("computedRetailerStep").get(function () {
  if (this.quantityStepMultipleOverride != null) {
    return this.quantityStepMultipleOverride;
  }
  return Math.max(1, Math.round((this.minimumOrderQuantity * this.retailerStepPercentage) / 100));
});

export const SupplierOffer = mongoose.model("SupplierOffer", supplierOfferSchema);
export default SupplierOffer;

