import { asyncHandler } from "../utils/asyncHandler.js";
import { APIResponse } from "../utils/apiResponse.js";
import { ApiError } from "../utils/apiError.js";
import { Supplier } from "../models/Supplier.model.js";
import { SupplierOffer } from "../models/SupplierOffer.model.js";
import { Product } from "../models/Product.model.js";
import { GroupBuyPool } from "../models/GroupBuyPool.model.js";
import { Quote } from "../models/Quote.model.js";
import { Payment } from "../models/Payment.model.js";
import { Refund } from "../models/Refund.model.js";
import { Contribution } from "../models/Contribution.model.js";
import { AuditLog } from "../models/AuditLog.model.js";
import { AIExecutionLog } from "../models/AIExecutionLog.model.js";
import { reconcilePaymentState } from "../services/payments/payment.service.js";
import { logEvent } from "../services/notifications/audit.service.js";
import { evaluatePoolDeadlines } from "../jobs/poolScheduler.job.js";
import { processExpiredDecisionWindow } from "../services/groupBuy/underMoqDecision.service.js";
import clockService from "../services/clock/clock.service.js";

/**
 * Task SRU-10: Administrator Workspace, Moderation & Payment Reconciliation Controller
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. Supplier Moderation APIs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/admin/suppliers
 * Creates a new supplier with provenance and verification metadata.
 */
export const createSupplier = asyncHandler(async (req, res) => {
  const {
    name,
    contactReference,
    serviceAreas,
    verificationStatus = "VERIFIED",
    dataSourceType = "VERIFIED_LIVE",
    ownerUserId,
  } = req.body;

  if (!name || !name.trim()) {
    throw new ApiError(400, "Supplier company name is required.");
  }

  if (!serviceAreas || !Array.isArray(serviceAreas) || serviceAreas.length === 0) {
    throw new ApiError(400, "At least one service area is required.");
  }

  const supplier = await Supplier.create({
    name: name.trim(),
    contactReference: contactReference || {},
    serviceAreas: serviceAreas.map((a) => a.trim().toUpperCase()),
    verificationStatus,
    dataSourceType,
    ownerUserId: ownerUserId || req.user?._id || null,
  });

  await logEvent({
    correlationId: req.correlationId || "admin-supplier-create",
    actorId: req.user?._id,
    actorRole: req.user?.role || "ADMIN",
    action: "SUPPLIER_CREATED",
    resourceType: "SUPPLIER",
    resourceId: supplier._id,
    metadata: {
      name: supplier.name,
      verificationStatus: supplier.verificationStatus,
      dataSourceType: supplier.dataSourceType,
    },
  });

  return res.status(201).json(
    new APIResponse(201, supplier, "Supplier created successfully.")
  );
});

/**
 * PATCH /api/admin/suppliers/:id
 * Updates supplier moderation, active status, and provenance facts.
 */
export const updateSupplier = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  const supplier = await Supplier.findById(id);
  if (!supplier) {
    throw new ApiError(404, `Supplier ${id} not found.`);
  }

  const permittedFields = [
    "name",
    "contactReference",
    "serviceAreas",
    "verificationStatus",
    "activeStatus",
    "dataSourceType",
  ];

  for (const field of permittedFields) {
    if (updates[field] !== undefined) {
      if (field === "serviceAreas" && Array.isArray(updates[field])) {
        supplier.serviceAreas = updates[field].map((a) => a.trim().toUpperCase());
      } else {
        supplier[field] = updates[field];
      }
    }
  }

  await supplier.save();

  await logEvent({
    correlationId: req.correlationId || "admin-supplier-update",
    actorId: req.user?._id,
    actorRole: req.user?.role || "ADMIN",
    action: "SUPPLIER_UPDATED",
    resourceType: "SUPPLIER",
    resourceId: supplier._id,
    metadata: {
      verificationStatus: supplier.verificationStatus,
      activeStatus: supplier.activeStatus,
    },
  });

  return res.status(200).json(
    new APIResponse(200, supplier, "Supplier updated successfully.")
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Offer Moderation APIs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/admin/offers
 * Creates a catalogue offer with MOQ, step parameters, and pricing tiers.
 */
export const createOffer = asyncHandler(async (req, res) => {
  const {
    supplierId,
    productId,
    packUnit,
    packSize,
    currency = "INR",
    baseUnitPriceMinor,
    quantityTiers = [],
    minimumOrderQuantity,
    retailerMoqPercentage = 20,
    retailerStepPercentage = 1,
    minRetailerQuantityOverride,
    quantityStepMultipleOverride,
    acceptsUnderMoqOrders = false,
    deliveryAreas = [],
    leadTimeDays = 5,
    shippingTerms = "Standard Shipping",
    flatShippingCostMinor = 0,
    shippingAllocationMethod = "PER_UNIT",
    taxInclusion = "GST_EXCLUDED",
    availabilityStatus = "IN_STOCK",
    expiresAt,
    dataSourceType = "VERIFIED_LIVE",
    verificationStatus = "VERIFIED",
  } = req.body;

  // Validation
  if (!supplierId || !productId) {
    throw new ApiError(400, "supplierId and productId are required.");
  }
  if (!packUnit || !packSize) {
    throw new ApiError(400, "packUnit and packSize are required.");
  }
  if (!baseUnitPriceMinor || baseUnitPriceMinor <= 0) {
    throw new ApiError(400, "baseUnitPriceMinor must be a positive integer.");
  }
  if (!minimumOrderQuantity || minimumOrderQuantity <= 0) {
    throw new ApiError(400, "minimumOrderQuantity must be a positive integer.");
  }

  // Role check: If SUPPLIER, can only create for their own supplier ID
  if (req.user?.role === "SUPPLIER") {
    const userSupplierId = req.user.supplierId?.toString() || req.user._id?.toString();
    if (userSupplierId !== supplierId.toString()) {
      throw new ApiError(403, "Access forbidden: You can only create offers for your own supplier profile.");
    }
  }

  const offer = await SupplierOffer.create({
    supplierId,
    productId,
    packUnit: packUnit.trim().toUpperCase(),
    packSize: packSize.trim(),
    currency,
    baseUnitPriceMinor,
    quantityTiers,
    minimumOrderQuantity,
    retailerMoqPercentage,
    retailerStepPercentage,
    minRetailerQuantityOverride: minRetailerQuantityOverride || null,
    quantityStepMultipleOverride: quantityStepMultipleOverride || null,
    acceptsUnderMoqOrders,
    deliveryAreas: deliveryAreas.map((a) => a.trim().toUpperCase()),
    leadTimeDays,
    shippingTerms,
    flatShippingCostMinor,
    shippingAllocationMethod,
    taxInclusion,
    availabilityStatus,
    expiresAt: expiresAt || new Date(clockService.now().getTime() + 14 * 86400000),
    dataSourceType,
    verificationStatus,
  });

  await logEvent({
    correlationId: req.correlationId || "admin-offer-create",
    actorId: req.user?._id,
    actorRole: req.user?.role || "ADMIN",
    action: "OFFER_CREATED",
    resourceType: "OFFER",
    resourceId: offer._id,
    metadata: {
      supplierId: offer.supplierId,
      productId: offer.productId,
      baseUnitPriceMinor: offer.baseUnitPriceMinor,
      minimumOrderQuantity: offer.minimumOrderQuantity,
    },
  });

  return res.status(201).json(
    new APIResponse(201, offer, "Supplier offer created successfully.")
  );
});

/**
 * PATCH /api/admin/offers/:id
 * Updates supplier offer pricing, status, and terms.
 */
export const updateOffer = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  const offer = await SupplierOffer.findById(id);
  if (!offer) {
    throw new ApiError(404, `Supplier offer ${id} not found.`);
  }

  // Role check: If SUPPLIER, verify ownership
  if (req.user?.role === "SUPPLIER") {
    const userSupplierId = req.user.supplierId?.toString() || req.user._id?.toString();
    if (userSupplierId !== offer.supplierId.toString()) {
      throw new ApiError(403, "Access forbidden: You can only update offers for your own supplier profile.");
    }
  }

  const permittedFields = [
    "baseUnitPriceMinor",
    "quantityTiers",
    "minimumOrderQuantity",
    "retailerMoqPercentage",
    "retailerStepPercentage",
    "minRetailerQuantityOverride",
    "quantityStepMultipleOverride",
    "acceptsUnderMoqOrders",
    "deliveryAreas",
    "leadTimeDays",
    "shippingTerms",
    "flatShippingCostMinor",
    "shippingAllocationMethod",
    "taxInclusion",
    "availabilityStatus",
    "expiresAt",
    "dataSourceType",
    "verificationStatus",
  ];

  for (const field of permittedFields) {
    if (updates[field] !== undefined) {
      if (field === "deliveryAreas" && Array.isArray(updates[field])) {
        offer.deliveryAreas = updates[field].map((a) => a.trim().toUpperCase());
      } else {
        offer[field] = updates[field];
      }
    }
  }

  await offer.save();

  await logEvent({
    correlationId: req.correlationId || "admin-offer-update",
    actorId: req.user?._id,
    actorRole: req.user?.role || "ADMIN",
    action: "OFFER_UPDATED",
    resourceType: "OFFER",
    resourceId: offer._id,
    metadata: {
      baseUnitPriceMinor: offer.baseUnitPriceMinor,
      availabilityStatus: offer.availabilityStatus,
    },
  });

  return res.status(200).json(
    new APIResponse(200, offer, "Supplier offer updated successfully.")
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Reconciliation Dashboard API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/reconciliation
 * Surfaces stalled pools, expired quotes, attention payments, failed refunds, and failed AI logs.
 */
export const getReconciliationDashboard = asyncHandler(async (req, res) => {
  const now = clockService.now();

  // 1. Stalled & At-Risk Pools
  const stalledPools = await GroupBuyPool.find({
    $or: [
      { state: { $in: ["NEEDS_REVIEW", "AWAITING_PAYMENT", "UNDER_MOQ_DECISION_PENDING", "AWAITING_SUPPLIER_UNDER_MOQ_FEASIBILITY"] } },
      { state: "RECRUITING", deadline: { $lte: now } },
    ],
  })
    .sort({ updatedAt: -1 })
    .limit(50)
    .lean();

  // 2. Expired Quotes
  const expiredQuotes = await Quote.find({
    $or: [
      { status: "EXPIRED" },
      { validUntil: { $lte: now }, status: { $ne: "ACCEPTED" } },
    ],
  })
    .sort({ validUntil: -1 })
    .limit(50)
    .lean();

  // 3. Payments Requiring Attention
  const attentionPayments = await Payment.find({
    $or: [
      { paymentStatus: { $in: ["UNKNOWN", "CAPTURE_PENDING", "FAILED"] } },
      { "reconciliationNotes.0": { $exists: true } },
    ],
  })
    .sort({ updatedAt: -1 })
    .limit(50)
    .lean();

  // 4. Failed Refunds
  const failedRefunds = await Refund.find({
    status: "FAILED",
  })
    .sort({ updatedAt: -1 })
    .limit(50)
    .lean();

  // 5. Failed AI Execution Logs
  const failedAiLogs = await AIExecutionLog.find({
    status: { $ne: "SUCCESS" },
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  const summary = {
    stalledPoolsCount: stalledPools.length,
    expiredQuotesCount: expiredQuotes.length,
    attentionPaymentsCount: attentionPayments.length,
    failedRefundsCount: failedRefunds.length,
    failedAiLogsCount: failedAiLogs.length,
  };

  return res.status(200).json(
    new APIResponse(
      200,
      {
        summary,
        stalledPools,
        expiredQuotes,
        attentionPayments,
        failedRefunds,
        failedAiLogs,
      },
      "Reconciliation dashboard data retrieved successfully."
    )
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Immutability Guard: Payment Annotation API (FR-ADMIN-005)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/admin/reconciliation/:paymentId/annotate
 *
 * Implements Rule FR-ADMIN-005:
 * Administrators can add reconciliation notes and trigger provider syncs,
 * but can NEVER overwrite, modify, or delete captured payment facts
 * (amountMinor, currency, providerOrderId, providerCaptureId, payerUserId, poolId, etc.).
 */
export const annotatePayment = asyncHandler(async (req, res) => {
  const { paymentId } = req.params;
  const { note, notes, syncWithProvider } = req.body;

  const noteText = (note || notes || "").trim();
  if (!noteText) {
    throw new ApiError(400, "Reconciliation note is required.");
  }

  const payment = await Payment.findById(paymentId);
  if (!payment) {
    throw new ApiError(404, `Payment ${paymentId} not found.`);
  }

  // 1. Strictly append reconciliation note without touching historical facts
  payment.reconciliationNotes.push({
    note: noteText,
    addedByUserId: req.user._id,
    addedAt: clockService.now(),
  });

  // 2. If provider sync requested, invoke provider reconciliation
  let syncResult = null;
  if (syncWithProvider) {
    try {
      syncResult = await reconcilePaymentState(payment._id);
    } catch (syncErr) {
      console.warn(`[Payment Reconciliation Sync Error]: ${syncErr.message}`);
    }
  }

  await payment.save();

  // 3. Immutable audit log entry
  await logEvent({
    correlationId: req.correlationId || "admin-payment-annotate",
    actorId: req.user._id,
    actorRole: req.user.role,
    action: "PAYMENT_ANNOTATED",
    resourceType: "PAYMENT",
    resourceId: payment._id,
    poolId: payment.poolId,
    metadata: {
      note: noteText,
      syncWithProvider: Boolean(syncWithProvider),
      syncedStatus: syncResult?.newStatus || payment.paymentStatus,
    },
  });

  return res.status(200).json(
    new APIResponse(
      200,
      {
        payment,
        synced: Boolean(syncWithProvider),
        syncResult,
      },
      "Payment reconciliation note recorded successfully without modifying captured facts."
    )
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Audit Trail & Scheduled Jobs APIs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/audit-logs
 * Queries immutable AuditLog records with filtering and pagination.
 */
export const getAuditLogs = asyncHandler(async (req, res) => {
  const {
    correlationId,
    action,
    resourceType,
    actorRole,
    actorId,
    poolId,
    orderId,
    page = 1,
    limit = 50,
  } = req.query;

  const filter = {};
  if (correlationId) filter.correlationId = correlationId.trim();
  if (action) filter.action = action.trim();
  if (resourceType) filter.resourceType = resourceType.trim().toUpperCase();
  if (actorRole) filter.actorRole = actorRole.trim().toUpperCase();
  if (actorId) filter.actorId = actorId;
  if (poolId) filter.poolId = poolId;
  if (orderId) filter.orderId = orderId;

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);

  const total = await AuditLog.countDocuments(filter);
  const auditLogs = await AuditLog.find(filter)
    .sort({ createdAt: -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum)
    .lean();

  return res.status(200).json(
    new APIResponse(
      200,
      {
        auditLogs,
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum) || 1,
      },
      "Audit logs retrieved successfully."
    )
  );
});

/**
 * POST /api/admin/jobs/run-lifecycle-check
 * Triggers 72h pool deadline and 24h decision cutoff evaluator.
 * Supports test clock time travel in development/test.
 */

/**
 * GET /api/admin/ai-logs
 * Queries immutable AIExecutionLog records with filtering and pagination.
 */
export const getAILogs = asyncHandler(async (req, res) => {
  const {
    correlationId,
    operation,
    status,
    page = 1,
    limit = 50,
  } = req.query;

  const filter = {};
  if (correlationId) filter.correlationId = correlationId.trim();
  if (operation) filter.operation = operation.trim().toUpperCase();
  if (status) filter.status = status.trim().toUpperCase();

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);

  const total = await AIExecutionLog.countDocuments(filter);
  const aiLogs = await AIExecutionLog.find(filter)
    .sort({ createdAt: -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum)
    .lean();

  return res.status(200).json(
    new APIResponse(
      200,
      {
        aiLogs,
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum) || 1,
      },
      "AI execution logs retrieved successfully."
    )
  );
});

export const runLifecycleCheck = asyncHandler(async (req, res) => {
  const { offsetMinutes, offsetHours, targetDate } = req.body || {};

  // Support test clock offset for live demos and integration tests
  if (process.env.NODE_ENV !== "production") {
    if (targetDate) {
      clockService.setFixedTime(new Date(targetDate));
    } else if (offsetHours !== undefined) { clockService.reset(); if (Number(offsetHours) > 0) { clockService.advanceTimeByHours(Number(offsetHours)); } } else if (offsetMinutes) {
      clockService.advanceTimeByMs(Number(offsetMinutes) * 60 * 1000);
    }
  }

  // 1. Evaluate 72h recruiting pool deadlines
  const poolDeadlineResults = await evaluatePoolDeadlines();

  // 2. Evaluate expired 24h under-MOQ buyer decision windows
  const now = clockService.now();
  const expiredDecisionPools = await GroupBuyPool.find({
    state: "UNDER_MOQ_DECISION_PENDING",
    decisionDeadline: { $lte: now },
  });

  let expiredDecisionWindowsProcessed = 0;
  for (const pool of expiredDecisionPools) {
    try {
      await processExpiredDecisionWindow(pool._id);
      expiredDecisionWindowsProcessed++;
    } catch (decisionErr) {
      console.warn(`[Lifecycle Check] Decision window error for pool ${pool._id}:`, decisionErr.message);
    }
  }

  const results = {
    lockedMoqReached: poolDeadlineResults?.lockedMoqReached || 0,
    lockedUnderMoq: poolDeadlineResults?.lockedUnderMoq || 0,
    expiredDecisionWindowsProcessed,
  };

  await logEvent({
    correlationId: req.correlationId || "admin-job-lifecycle-check",
    actorId: req.user?._id,
    actorRole: req.user?.role || "ADMIN",
    action: "LIFECYCLE_CHECK_EXECUTED",
    resourceType: "POOL",
    resourceId: req.user?._id || new mongoose.Types.ObjectId(),
    metadata: {
      timestamp: clockService.now(),
      results,
    },
  });

  return res.status(200).json(
    new APIResponse(
      200,
      {
        timestamp: clockService.now(),
        results,
      },
      "Lifecycle check executed successfully."
    )
  );
});


export const resetUnderMoqPool = asyncHandler(async (_req, res) => {
  const pool = await GroupBuyPool.findOne({ title: "Lucknow Premium Rice Pool (Under-MOQ Resolution)" });
  if (pool) {
    clockService.reset();
    pool.state = "UNDER_MOQ_DECISION_PENDING";
    pool.lockReason = "EXPIRED_72H_UNDER_MOQ";
    pool.decisionDeadline = new Date(Date.now() + 100 * 3600000);
    await pool.save();
    await Contribution.updateMany(
      { poolId: pool._id },
      { $set: { state: "ACTIVE", underMoqDecision: "PENDING", totalRefundedMinor: 0 } }
    );
    await Payment.updateMany(
      { poolId: pool._id },
      { $set: { paymentStatus: "PAID", status: "PAID" } }
    );
    await Refund.deleteMany({ poolId: pool._id });
  }
  return res.status(200).json(new APIResponse(200, { reset: true }, "Under-MOQ pool reset."));
});
