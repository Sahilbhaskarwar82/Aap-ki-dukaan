import crypto from "crypto";
import mongoose from "mongoose";
import {
  AuditLog,
  AUDIT_ACTOR_ROLES,
  AUDIT_RESOURCE_TYPES,
} from "../../models/AuditLog.model.js";
import { ApiError } from "../../utils/apiError.js";

/**
 * Sensitive field patterns that must be redacted from metadata before storing.
 */
const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /authorization/i,
  /bearer/i,
  /apikey/i,
  /api_key/i,
  /clientsecret/i,
  /client_secret/i,
  /creditcard/i,
  /cardnumber/i,
  /cvv/i,
  /cvc/i,
  /privatekey/i,
  /private_key/i,
  /accesstoken/i,
  /access_token/i,
];

function isModelRegistered(name) {
  try {
    return !!mongoose.model(name);
  } catch {
    return false;
  }
}

/**
 * Deeply scrubs sensitive data (passwords, auth tokens, client secrets)
 * from audit log metadata payloads.
 *
 * @param {*} data
 * @returns {*}
 */
export function scrubSensitiveData(data) {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data !== "object") {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => scrubSensitiveData(item));
  }

  const cleaned = {};
  for (const [key, val] of Object.entries(data)) {
    const isSensitive = SENSITIVE_KEY_PATTERNS.some((pattern) =>
      pattern.test(key)
    );

    if (isSensitive) {
      cleaned[key] = "[REDACTED]";
    } else if (typeof val === "object" && val !== null) {
      cleaned[key] = scrubSensitiveData(val);
    } else {
      cleaned[key] = val;
    }
  }

  return cleaned;
}

/**
 * Task SRU-09: Logs an immutable platform audit event.
 *
 * Implements HLD §8, database_schemas.md §3.17:
 *  - Enforces correlationId propagation.
 *  - Automatically scrubs sensitive data from metadata.
 *  - Non-throwing try/catch boundary protects financial state machines.
 *
 * @param {object} params
 * @param {string} [params.correlationId]
 * @param {string|mongoose.Types.ObjectId} [params.actorId]
 * @param {string} [params.actorRole]
 * @param {string} params.action Required
 * @param {string} params.resourceType Required
 * @param {string|mongoose.Types.ObjectId} params.resourceId Required
 * @param {string|mongoose.Types.ObjectId} [params.poolId]
 * @param {string|mongoose.Types.ObjectId} [params.orderId]
 * @param {object} [params.metadata]
 * @param {boolean} [params.throwOnError=false]
 * @returns {Promise<{ success: boolean, auditLog?: object, error?: string }>}
 */
export async function logEvent(params = {}) {
  try {
    const {
      correlationId = crypto.randomUUID(),
      actorId = null,
      actorRole = actorId ? "SHOP_OWNER" : "SYSTEM_SCHEDULER",
      action,
      resourceType,
      resourceId,
      poolId = null,
      orderId = null,
      metadata = {},
      throwOnError = false,
    } = params;

    if (!action) {
      const err = new ApiError(400, "action is required for AuditLog.");
      if (throwOnError) throw err;
      console.warn("[AuditService] AuditLog skipped: missing action.");
      return { success: false, error: err.message };
    }

    if (!resourceType || !AUDIT_RESOURCE_TYPES.includes(resourceType)) {
      const err = new ApiError(
        400,
        `Invalid resourceType '${resourceType}'. Must be one of: ${AUDIT_RESOURCE_TYPES.join(", ")}`
      );
      if (throwOnError) throw err;
      console.warn(`[AuditService] AuditLog skipped: ${err.message}`);
      return { success: false, error: err.message };
    }

    if (!resourceId) {
      const err = new ApiError(400, "resourceId is required for AuditLog.");
      if (throwOnError) throw err;
      console.warn("[AuditService] AuditLog skipped: missing resourceId.");
      return { success: false, error: err.message };
    }

    if (!AUDIT_ACTOR_ROLES.includes(actorRole)) {
      const err = new ApiError(
        400,
        `Invalid actorRole '${actorRole}'. Must be one of: ${AUDIT_ACTOR_ROLES.join(", ")}`
      );
      if (throwOnError) throw err;
      console.warn(`[AuditService] AuditLog skipped: ${err.message}`);
      return { success: false, error: err.message };
    }

    // Scrub all metadata of secrets
    const scrubbedMetadata = scrubSensitiveData(metadata);

    const auditLog = await AuditLog.create({
      correlationId: correlationId || crypto.randomUUID(),
      actorId,
      actorRole,
      action: action.trim(),
      resourceType,
      resourceId,
      poolId,
      orderId,
      metadata: scrubbedMetadata,
    });

    return { success: true, auditLog };
  } catch (err) {
    console.error("[AuditService] Failed to record audit log:", err.message);
    if (params?.throwOnError) {
      throw err;
    }
    return { success: false, error: err.message };
  }
}

/**
 * Returns chronological activity history for an Order.
 *
 * @param {string|mongoose.Types.ObjectId} orderId
 * @param {object} options { page: number, limit: number, sortOrder: 'asc'|'desc' }
 * @returns {Promise<{ activity: object[], total: number, page: number, limit: number }>}
 */
export async function getOrderActivityTimeline(orderId, options = {}) {
  const page = Math.max(1, parseInt(options.page || 1, 10));
  const limit = Math.min(100, Math.max(1, parseInt(options.limit || 50, 10)));
  const skip = (page - 1) * limit;
  const sortDirection = options.sortOrder === "asc" ? 1 : -1;

  const filter = { orderId };

  let query = AuditLog.find(filter)
    .sort({ createdAt: sortDirection })
    .skip(skip)
    .limit(limit);

  if (isModelRegistered("User")) {
    query = query.populate("actorId", "name email role");
  }

  const [activity, total] = await Promise.all([
    query.lean(),
    AuditLog.countDocuments(filter),
  ]);

  return {
    activity,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

/**
 * Returns chronological activity history for a GroupBuyPool.
 *
 * @param {string|mongoose.Types.ObjectId} poolId
 * @param {object} options { page: number, limit: number, sortOrder: 'asc'|'desc' }
 * @returns {Promise<{ activity: object[], total: number, page: number, limit: number }>}
 */
export async function getPoolActivityTimeline(poolId, options = {}) {
  const page = Math.max(1, parseInt(options.page || 1, 10));
  const limit = Math.min(100, Math.max(1, parseInt(options.limit || 50, 10)));
  const skip = (page - 1) * limit;
  const sortDirection = options.sortOrder === "asc" ? 1 : -1;

  const filter = { poolId };

  let query = AuditLog.find(filter)
    .sort({ createdAt: sortDirection })
    .skip(skip)
    .limit(limit);

  if (isModelRegistered("User")) {
    query = query.populate("actorId", "name email role");
  }

  const [activity, total] = await Promise.all([
    query.lean(),
    AuditLog.countDocuments(filter),
  ]);

  return {
    activity,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

/**
 * Platform administrative audit query inspector.
 *
 * @param {object} filter
 * @param {object} options
 */
export async function listAuditLogs(filter = {}, options = {}) {
  const page = Math.max(1, parseInt(options.page || 1, 10));
  const limit = Math.min(100, Math.max(1, parseInt(options.limit || 50, 10)));
  const skip = (page - 1) * limit;

  const queryFilter = {};
  if (filter.correlationId) queryFilter.correlationId = filter.correlationId;
  if (filter.actorId) queryFilter.actorId = filter.actorId;
  if (filter.actorRole) queryFilter.actorRole = filter.actorRole;
  if (filter.action) queryFilter.action = filter.action;
  if (filter.resourceType) queryFilter.resourceType = filter.resourceType;
  if (filter.resourceId) queryFilter.resourceId = filter.resourceId;
  if (filter.poolId) queryFilter.poolId = filter.poolId;
  if (filter.orderId) queryFilter.orderId = filter.orderId;

  let query = AuditLog.find(queryFilter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  if (isModelRegistered("User")) {
    query = query.populate("actorId", "name email role");
  }

  const [logs, total] = await Promise.all([
    query.lean(),
    AuditLog.countDocuments(queryFilter),
  ]);

  return {
    logs,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

export default {
  logEvent,
  scrubSensitiveData,
  getOrderActivityTimeline,
  getPoolActivityTimeline,
  listAuditLogs,
};
