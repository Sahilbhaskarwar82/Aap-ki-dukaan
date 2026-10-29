import mongoose from "mongoose";

/**
 * SupplierSettlement Model — SRU-07
 *
 * Tracks wholesaler payout completely separately from buyer payment captures
 * (BR-009 & FR-PAY-016).
 *
 * Key constraints:
 *  - orderId is unique (one settlement record per bulk order).
 *  - amountMinor is stored as an integer in minor currency units (paise/cents).
 *  - In the prototype, default settlementStatus is strictly 'SIMULATED' and
 *    mode is 'DEMO' with explicit disclosure notes, ensuring demo/sandbox
 *    funds are never misrepresented as verified live bank transfers.
 */

const supplierSettlementSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      unique: true,
      index: true,
    },
    poolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GroupBuyPool",
      required: true,
      index: true,
    },
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
      index: true,
    },
    amountMinor: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      required: true,
      enum: ["INR", "USD"],
      default: "INR",
    },
    settlementStatus: {
      type: String,
      enum: [
        "NOT_STARTED",
        "SIMULATED",
        "PENDING",
        "CONFIRMED",
        "FAILED",
        "NEEDS_REVIEW",
      ],
      default: "SIMULATED",
      required: true,
      index: true,
    },
    mode: {
      type: String,
      enum: ["DEMO", "MANUAL", "INTEGRATED"],
      default: "DEMO",
      required: true,
    },
    providerReference: {
      type: String,
      default: null,
      trim: true,
    },
    confirmedAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      default: "Simulated supplier settlement for prototype demonstration.",
      trim: true,
    },
  },
  { timestamps: true }
);

supplierSettlementSchema.index({ supplierId: 1, settlementStatus: 1 });

export const SupplierSettlement = mongoose.model(
  "SupplierSettlement",
  supplierSettlementSchema
);
