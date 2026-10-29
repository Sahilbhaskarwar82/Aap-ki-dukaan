import mongoose from "mongoose";

/**
 * Notification Model — SRU-08
 *
 * Persistent In-App Notification Center supporting all 19 procurement lifecycle events.
 *
 * Requirements (FR-NOTIF-001, FR-NOTIF-004, database_schemas.md §3.16):
 *  - Supports 19 explicit lifecycle event types.
 *  - Recipient-scoped with unread tracking (isRead, readAt).
 *  - Indexed on { recipientUserId: 1, isRead: 1, createdAt: -1 } for fast feed queries.
 *  - Non-throwing try/catch boundary protects all calling mutations.
 */

export const NOTIFICATION_TYPES = [
  "POOL_CREATED",
  "POOL_JOINED",
  "PAYMENT_VERIFIED",
  "PAYMENT_FAILED",
  "QUANTITY_UPDATED",
  "MOQ_MILESTONE",
  "MOQ_REACHED_LOCKED",
  "EXPIRED_72H_UNDER_MOQ",
  "UNDER_MOQ_DECISION_REQUIRED",
  "DECISION_DEADLINE_APPROACHING",
  "SUPPLIER_QUOTE_REVISED",
  "SNAPSHOT_APPROVAL_REQUIRED",
  "APPROVAL_INVALIDATED",
  "REFUND_INITIATED",
  "REFUND_COMPLETED",
  "REFUND_FAILED",
  "ORDER_CONFIRMED",
  "ORDER_REJECTED",
  "ORDER_STATUS_UPDATED",
];

const notificationSchema = new mongoose.Schema(
  {
    recipientUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shop",
      default: null,
      index: true,
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    linkUrl: {
      type: String,
      required: true,
      trim: true,
      default: "/dashboard",
    },
    relatedPoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GroupBuyPool",
      default: null,
      index: true,
    },
    relatedOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

notificationSchema.index({ recipientUserId: 1, isRead: 1, createdAt: -1 });

export const Notification = mongoose.model("Notification", notificationSchema);
