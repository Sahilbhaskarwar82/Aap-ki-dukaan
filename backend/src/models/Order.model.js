import mongoose from "mongoose";

/**
 * Order Model — SRU-05 / SRU-06
 *
 * Finalized bulk order created when a GroupBuyPool reaches FUNDED state.
 * Contains aggregate wholesale totals as well as itemized member-level allocations.
 *
 * Authoritative constraints (HLD §2, database_schemas.md §3.14):
 *  - Monetary amounts stored strictly in minor integer units (paise/cents).
 *  - orderNumber is unique (e.g. "AKD-2026-0001").
 *  - poolId is unique (one order per group buy pool).
 *  - Separates buyer payment captures from wholesaler settlement.
 */

const memberOrderAllocationSchema = new mongoose.Schema(
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
    shopName: {
      type: String,
      required: true,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    unit: {
      type: String,
      required: true,
      trim: true,
    },
    unitPriceMinor: {
      type: Number,
      required: true,
      min: 1,
    },
    merchandiseShareMinor: {
      type: Number,
      required: true,
      min: 0,
    },
    shippingShareMinor: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    totalPaidMinor: {
      type: Number,
      required: true,
      min: 0,
    },
    deliveryStatus: {
      type: String,
      enum: ["PENDING", "DISPATCHED", "DELIVERED", "CANCELLED"],
      default: "PENDING",
    },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    poolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GroupBuyPool",
      required: true,
      unique: true,
      index: true,
    },
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    supplierOfferId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SupplierOffer",
      required: true,
    },
    priceSnapshotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PriceSnapshot",
      required: true,
    },
    currency: {
      type: String,
      required: true,
      enum: ["INR", "USD"],
      default: "INR",
    },
    totalQuantity: {
      type: Number,
      required: true,
      min: 1,
    },
    unit: {
      type: String,
      required: true,
      trim: true,
    },
    merchandiseTotalMinor: {
      type: Number,
      required: true,
      min: 0,
    },
    shippingTotalMinor: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    grandTotalMinor: {
      type: Number,
      required: true,
      min: 0,
    },
    memberOrders: {
      type: [memberOrderAllocationSchema],
      required: true,
      validate: [(val) => val.length > 0, "Order must have at least one member allocation"],
    },

    // Supplier Confirmation State
    supplierConfirmationStatus: {
      type: String,
      enum: ["PENDING", "CONFIRMED", "REJECTED"],
      default: "PENDING",
      required: true,
    },
    supplierReference: {
      type: String,
      default: null,
      trim: true,
    },
    isSimulatedConfirmation: {
      type: Boolean,
      default: true,
    },
    confirmedAt: {
      type: Date,
      default: null,
    },
    expectedDeliveryDate: {
      type: Date,
      default: null,
    },

    orderState: {
      type: String,
      enum: [
        "AWAITING_SUPPLIER_CONFIRMATION",
        "CONFIRMED",
        "PROCESSING",
        "SHIPPED",
        "DELIVERED",
        "FULFILLED",
        "CANCELLED",
        "EXCEPTION",
      ],
      default: "AWAITING_SUPPLIER_CONFIRMATION",
      required: true,
      index: true,
    },
    cancellationReason: {
      type: String,
      default: null,
      trim: true,
    },
  },
  { timestamps: true }
);

orderSchema.index({ supplierId: 1, orderState: 1 });
orderSchema.index({ "memberOrders.shopId": 1 });

export const Order = mongoose.model("Order", orderSchema);
