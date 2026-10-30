import mongoose from "mongoose";

const groupBuyPoolSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 180 },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    supplierOfferId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SupplierOffer",
      required: true,
      index: true,
    },
    activeQuoteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Quote",
      default: null,
    },
    deliveryArea: { type: String, required: true, trim: true, index: true },
    currency: { type: String, required: true, default: "INR", enum: ["INR", "USD"] },
    packUnit: { type: String, required: true, uppercase: true, trim: true },

    // Wholesaler MOQ, Retailer MOQ (20%), and Step Multiple (1%)
    targetMoq: { type: Number, required: true, min: 1 },
    retailerMoqPercentage: { type: Number, required: true, default: 20 },
    retailerStepPercentage: { type: Number, required: true, default: 1 },
    minRetailerQuantity: { type: Number, required: true, min: 1, default: 1 },
    quantityStepMultiple: { type: Number, required: true, min: 1, default: 1 },

    // Real-Time Backend-Calculated Totals
    totalEligibleQuantity: { type: Number, required: true, default: 0, min: 0 },
    participantCount: { type: Number, required: true, default: 0, min: 0 },
    baseUnitPriceMinor: { type: Number, required: true, min: 1 },
    currentUnitPriceMinor: { type: Number, required: true, min: 1 },
    estimatedMerchandiseTotalMinor: { type: Number, required: true, default: 0, min: 0 },
    shippingCostMinor: { type: Number, default: null },
    shippingAllocationMethod: {
      type: String,
      enum: ["PER_UNIT", "PER_WEIGHT", "EQUAL_SHARE"],
      default: "PER_UNIT",
    },
    paymentPolicy: {
      type: String,
      enum: ["PAY_AT_JOIN", "PAY_AFTER_APPROVAL"],
      default: "PAY_AT_JOIN",
    },

    // Authoritative 72-Hour Timer & 24-Hour Under-MOQ Decision Timestamps
    publishedAt: { type: Date, required: true, default: Date.now },
    deadline: { type: Date, required: true, index: true },
    lockedAt: { type: Date, default: null },
    lockReason: {
      type: String,
      enum: ["NONE", "MOQ_REACHED_EARLY", "EXPIRED_72H_UNDER_MOQ", "ADMIN_LOCKED"],
      default: "NONE",
    },
    decisionDeadline: { type: Date, default: null, index: true },

    // Under-MOQ Feasibility & AI Recommendation
    supplierUnderMoqStatus: {
      type: String,
      enum: [
        "NOT_APPLICABLE",
        "AWAITING_SUPPLIER",
        "ACCEPTED_SUB_MOQ",
        "REVISED_QUOTE_PROVIDED",
        "REJECTED_SUB_MOQ",
      ],
      default: "NOT_APPLICABLE",
    },
    aiUnderMoqRecommendation: {
      suggestedAction: {
        type: String,
        enum: ["PROCEED", "WAIT_FOR_REVISED_QUOTE", "CANCEL", null],
        default: null,
      },
      explanation: { type: String, default: null },
      supportingFigures: { type: mongoose.Schema.Types.Mixed, default: null },
      uncertainties: [{ type: String }],
      generatedAt: { type: Date, default: null },
    },

    // Versioned Price Snapshot & Lifecycle State
    priceBreakdownVersion: { type: Number, required: true, default: 0 },
    latestPriceSnapshotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PriceSnapshot",
      default: null,
    },
    state: {
      type: String,
      enum: [
        "DRAFT",
        "RECRUITING",
        "MOQ_REACHED",
        "UNDER_MOQ_DECISION_PENDING",
        "AWAITING_SUPPLIER_UNDER_MOQ_FEASIBILITY",
        "AWAITING_REVISED_QUOTE_APPROVAL",
        "AWAITING_APPROVALS",
        "AWAITING_PAYMENT",
        "FUNDED",
        "SUPPLIER_ORDER_PENDING",
        "ORDERED",
        "FULFILLED",
        "EXPIRED",
        "CANCELLED",
        "FAILED",
        "NEEDS_REVIEW",
      ],
      default: "RECRUITING",
      required: true,
      index: true,
    },
    closedAt: { type: Date, default: null },
    closureReason: { type: String, default: null },
    createdByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true, optimisticConcurrency: true }
);

groupBuyPoolSchema.index({ state: 1, deadline: 1 });
groupBuyPoolSchema.index({ state: 1, decisionDeadline: 1 });

export const GroupBuyPool =
  mongoose.models.GroupBuyPool || mongoose.model("GroupBuyPool", groupBuyPoolSchema);
export default GroupBuyPool;
