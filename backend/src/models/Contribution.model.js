import mongoose from "mongoose";

const contributionSchema = new mongoose.Schema(
  {
    poolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GroupBuyPool",
      required: true,
      index: true,
    },
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shop",
      required: true,
      index: true,
    },
    requirementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Requirement",
      default: null,
    },
    createdByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    quantity: { type: Number, required: true, min: 1 },
    unit: { type: String, required: true, uppercase: true, trim: true },
    approvedSubstitution: {
      isSubstituted: { type: Boolean, default: false },
      substitutionNote: { type: String, default: null },
      approvedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      approvedAt: { type: Date, default: null },
    },

    // Authoritative Financial Breakdown (in minor units)
    unitPriceMinor: { type: Number, required: true, min: 1 },
    estimatedMerchandiseShareMinor: { type: Number, required: true, min: 0 },
    estimatedShippingShareMinor: { type: Number, required: true, default: 0, min: 0 },
    roundingAdjustmentMinor: { type: Number, required: true, default: 0 },
    finalTotalPayableMinor: { type: Number, required: true, min: 0 },
    verifiedSavingsMinor: { type: Number, required: true, default: 0, min: 0 },

    // Cumulative Payment & Refund Ledger
    totalPaidMinor: { type: Number, required: true, default: 0, min: 0 },
    totalRefundedMinor: { type: Number, required: true, default: 0, min: 0 },

    // Snapshot Approval Tracking
    approvalStatus: {
      type: String,
      enum: [
        "NOT_REQUIRED_YET",
        "PENDING_APPROVAL",
        "APPROVED",
        "INVALIDATED_BY_CHANGE",
        "REJECTED",
      ],
      default: "NOT_REQUIRED_YET",
      required: true,
    },
    approvedPriceSnapshotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PriceSnapshot",
      default: null,
    },
    approvedAt: { type: Date, default: null },

    // 24-Hour Under-MOQ Buyer Decision Tracking
    underMoqDecision: {
      type: String,
      enum: ["NOT_APPLICABLE", "PENDING", "PROCEED", "CANCEL", "EXPIRED_NO_RESPONSE"],
      default: "NOT_APPLICABLE",
      required: true,
    },
    underMoqDecisionAt: { type: Date, default: null },

    state: {
      type: String,
      enum: [
        "PENDING_PAYMENT",
        "ACTIVE",
        "WITHDRAWN",
        "CANCELLED_UNDER_MOQ",
        "REFUNDED",
        "FINALIZED",
      ],
      default: "PENDING_PAYMENT",
      required: true,
      index: true,
    },
    withdrawnAt: { type: Date, default: null },
  },
  { timestamps: true, optimisticConcurrency: true }
);

// Prevent duplicate active contributions by the same shop in the same pool
contributionSchema.index(
  { poolId: 1, shopId: 1 },
  {
    unique: true,
    partialFilterExpression: { state: { $in: ["PENDING_PAYMENT", "ACTIVE", "FINALIZED"] } },
  }
);

export const Contribution =
  mongoose.models.Contribution || mongoose.model("Contribution", contributionSchema);
export default Contribution;

