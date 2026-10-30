import mongoose from "mongoose";

const snapshotMemberShareSchema = new mongoose.Schema(
  {
    contributionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contribution",
      required: true,
    },
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shop",
      required: true,
    },
    quantity: { type: Number, required: true },
    unit: { type: String, required: true },
    appliedUnitPriceMinor: { type: Number, required: true },
    merchandiseShareMinor: { type: Number, required: true },
    shippingShareMinor: { type: Number, required: true },
    roundingAdjustmentMinor: { type: Number, required: true, default: 0 },
    totalPayableMinor: { type: Number, required: true },
    verifiedSavingsMinor: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const priceSnapshotSchema = new mongoose.Schema(
  {
    poolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GroupBuyPool",
      required: true,
      index: true,
    },
    version: { type: Number, required: true, min: 1 },
    supplierOfferId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SupplierOffer",
      required: true,
    },
    quoteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Quote",
      default: null,
    },
    currency: {
      type: String,
      required: true,
      default: "INR",
      enum: ["INR", "USD"],
    },
    totalEligibleQuantity: { type: Number, required: true },
    baseUnitPriceMinor: { type: Number, required: true },
    appliedUnitPriceMinor: { type: Number, required: true },
    merchandiseTotalMinor: { type: Number, required: true },
    shippingCostMinor: { type: Number, default: null },
    shippingStatus: {
      type: String,
      enum: ["KNOWN", "EXCLUDED_OR_PENDING"],
      required: true,
      default: "EXCLUDED_OR_PENDING",
    },
    shippingAllocationMethod: {
      type: String,
      enum: ["PER_UNIT", "PER_WEIGHT", "EQUAL_SHARE"],
      required: true,
      default: "PER_UNIT",
    },
    taxInclusion: {
      type: String,
      required: true,
      default: "GST_EXCLUDED",
    },
    groupTotalPayableMinor: { type: Number, required: true },
    baselineComparisonSource: {
      type: String,
      required: true,
      default: "OFFER_BASE_TIER",
    },
    baselineTimestamp: { type: Date, required: true, default: Date.now },
    memberShares: { type: [snapshotMemberShareSchema], required: true },
    isSuperseded: { type: Boolean, default: false },
  },
  { timestamps: true }
);

priceSnapshotSchema.index({ poolId: 1, version: -1 }, { unique: true });

export const PriceSnapshot =
  mongoose.models.PriceSnapshot || mongoose.model("PriceSnapshot", priceSnapshotSchema);
export default PriceSnapshot;

