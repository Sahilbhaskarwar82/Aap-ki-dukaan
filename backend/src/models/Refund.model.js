import mongoose from "mongoose";

/**
 * Refund Model — SRU-04
 *
 * Tracks every PayPal capture refund (or MOCK_DEV refund) issued for pool
 * contributions. All monetary values are strictly in MINOR UNITS (paise/cents).
 *
 * Reasons supported:
 *  - BUYER_WITHDRAWAL: Buyer explicitly withdrew before pool lock.
 *  - QUANTITY_REDUCTION: Buyer lowered box count; delta refunded.
 *  - TIER_PRICE_DROP_SAVINGS: Bulk pool locked at lower unit price than early joiner paid.
 *  - POOL_CANCELLED: Pool failed to reach MOQ or cancelled by admin.
 *  - UNDER_MOQ_BUYER_CANCEL: Buyer elected to cancel after 24h under-MOQ notice.
 *  - UNDER_MOQ_NO_RESPONSE: Buyer did not respond within 24h window.
 *  - SUPPLIER_REJECTED: Wholesaler declined final purchase order.
 *  - EXTRA_PAYMENT_FAILURE_ROLLBACK: Surcharge payment or delta rollback.
 */

export const REFUND_REASONS = [
  "BUYER_WITHDRAWAL",
  "QUANTITY_REDUCTION",
  "TIER_PRICE_DROP_SAVINGS",
  "POOL_CANCELLED",
  "UNDER_MOQ_BUYER_CANCEL",
  "UNDER_MOQ_NO_RESPONSE",
  "SUPPLIER_REJECTED",
  "EXTRA_PAYMENT_FAILURE_ROLLBACK",
];

export const REFUND_STATUSES = [
  "REQUESTED",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
];

const refundSchema = new mongoose.Schema(
  {
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      required: true,
      index: true,
    },
    poolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GroupBuyPool",
      required: true,
      index: true,
    },
    contributionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contribution",
      required: true,
      index: true,
    },
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shop",
      required: true,
      index: true,
    },
    recipientUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    amountMinor: {
      type: Number,
      required: true,
      min: 1,
    },
    currency: {
      type: String,
      required: true,
      enum: ["INR", "USD"],
      default: "INR",
    },
    reason: {
      type: String,
      required: true,
      enum: REFUND_REASONS,
      index: true,
    },
    providerRefundId: {
      type: String,
      index: {
        unique: true,
        sparse: true,
      },
    },
    idempotencyKey: {
      type: String,
      required: true,
      index: {
        unique: true,
      },
    },
    status: {
      type: String,
      required: true,
      enum: REFUND_STATUSES,
      default: "REQUESTED",
      index: true,
    },
    isTestTransaction: {
      type: Boolean,
      default: true,
    },
    failureReason: {
      type: String,
      default: null,
    },
    providerResponseSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

export const Refund = mongoose.model("Refund", refundSchema);
export default Refund;
