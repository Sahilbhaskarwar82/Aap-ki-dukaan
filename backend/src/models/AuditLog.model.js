import mongoose from "mongoose";

/**
 * AuditLog Model — SRU-09
 *
 * Immutable, append-only system audit log recording every platform state transition,
 * financial transaction, and administrative mutation.
 *
 * Key constraints:
 *  - Immutable: updatedAt is disabled ({ createdAt: true, updatedAt: false }).
 *  - Never stores raw sensitive PII, passwords, or secrets (scrubbed at ingestion).
 *  - Indexed on correlationId, poolId, orderId, and resourceId for fast tracing.
 */

export const AUDIT_ACTOR_ROLES = [
  "SHOP_OWNER",
  "SUPPLIER",
  "ADMIN",
  "REVIEWER",
  "SYSTEM_SCHEDULER",
  "WEBHOOK",
];

export const AUDIT_RESOURCE_TYPES = [
  "USER",
  "SHOP",
  "SUPPLIER",
  "REQUIREMENT",
  "UPLOAD",
  "OFFER",
  "QUOTE",
  "POOL",
  "CONTRIBUTION",
  "PRICE_SNAPSHOT",
  "PAYMENT",
  "REFUND",
  "ORDER",
  "SETTLEMENT",
];

const auditLogSchema = new mongoose.Schema(
  {
    correlationId: {
      type: String,
      required: true,
      index: true,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    actorRole: {
      type: String,
      enum: AUDIT_ACTOR_ROLES,
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    resourceType: {
      type: String,
      enum: AUDIT_RESOURCE_TYPES,
      required: true,
      index: true,
    },
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    poolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GroupBuyPool",
      default: null,
      index: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    // Immutable log: createdAt only, no updatedAt
    timestamps: { createdAt: true, updatedAt: false },
  }
);

auditLogSchema.index({ poolId: 1, createdAt: -1 });
auditLogSchema.index({ orderId: 1, createdAt: -1 });
auditLogSchema.index({ resourceType: 1, resourceId: 1, createdAt: -1 });

export const AuditLog = mongoose.model("AuditLog", auditLogSchema);
