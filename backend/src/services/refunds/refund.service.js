/**
 * Refund Service — SRU-04
 *
 * Multi-state refund lifecycle orchestrator for buyer withdrawals,
 * quantity reductions, automatic tier-drop savings, and pool cancellations.
 *
 * Enforces:
 *  - State machine: REQUESTED -> PROCESSING -> COMPLETED (or FAILED)
 *  - Idempotency guard via idempotencyKey
 *  - Over-refund prevention (refund amount cannot exceed remaining captured balance)
 *  - Contribution totalRefundedMinor and state transitions
 *  - Automatic tier-drop savings delta calculation on pool lock
 *  - Non-throwing notification dispatch (FR-NOTIF-004) & immutable audit logging
 */

import mongoose from "mongoose";
import { Refund } from "../../models/Refund.model.js";
import { Payment } from "../../models/Payment.model.js";
import { ApiError } from "../../utils/apiError.js";
import { getPayPalAdapter } from "../payments/paypalAdapter.service.js";

function getContribution() {
  return mongoose.model("Contribution");
}

function getPriceSnapshot() {
  return mongoose.model("PriceSnapshot");
}

function getGroupBuyPool() {
  return mongoose.model("GroupBuyPool");
}

async function safeLogAudit(event) {
  try {
    const mod = await import("../notifications/audit.service.js").catch(() => null);
    if (mod?.logEvent) {
      await mod.logEvent(event);
    }
  } catch (_ignored) {}
}

async function safeSendNotification(params) {
  try {
    const mod = await import("../notifications/notification.service.js").catch(() => null);
    if (mod?.createNotification) {
      await mod.createNotification(params);
    }
  } catch (_ignored) {}
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. initiateRefund
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initiates and executes a refund against a captured PayPal payment.
 *
 * @param {object} params
 * @param {string} params.paymentId       Mongo ObjectId of Payment
 * @param {number} [params.amountMinor]   Amount to refund in minor units (null = full refund)
 * @param {string} params.reason          REFUND_REASONS enum
 * @param {string} params.idempotencyKey  Unique idempotency key
 * @param {string} params.requesterUserId Authenticated requester's user ID
 * @param {object} [params.metadata]      Optional tracking metadata
 * @returns {Promise<{ refund: object, payment: object, isDuplicate: boolean }>}
 */
export async function initiateRefund({
  paymentId,
  amountMinor = null,
  reason,
  idempotencyKey,
  requesterUserId,
  metadata = {},
}) {
  if (!idempotencyKey) {
    throw new ApiError(400, "idempotencyKey is required for refund initiation.");
  }
  if (!reason) {
    throw new ApiError(400, "Refund reason is required.");
  }

  // 1. Idempotency Check
  const existingRefund = await Refund.findOne({ idempotencyKey });
  if (existingRefund) {
    const payment = await Payment.findById(existingRefund.paymentId);
    return { refund: existingRefund, payment, isDuplicate: true };
  }

  // 2. Validate Payment
  const payment = await Payment.findById(paymentId);
  if (!payment) {
    throw new ApiError(404, `Payment not found: ${paymentId}`);
  }

  const refundableStatuses = ["PAID", "PARTIALLY_REFUNDED"];
  if (!refundableStatuses.includes(payment.paymentStatus)) {
    throw new ApiError(
      409,
      `Payment is in status '${payment.paymentStatus}' and cannot be refunded. Only PAID or PARTIALLY_REFUNDED payments are refundable.`
    );
  }

  if (!payment.providerCaptureId) {
    throw new ApiError(
      400,
      "Payment does not have a providerCaptureId. Cannot initiate PayPal refund."
    );
  }

  // 3. Calculate remaining refundable balance
  const priorRefunds = await Refund.aggregate([
    { $match: { paymentId: payment._id, status: "COMPLETED" } },
    { $group: { _id: null, total: { $sum: "$amountMinor" } } },
  ]);
  const totalPriorRefunded = priorRefunds[0]?.total || 0;
  const remainingRefundable = payment.amountMinor - totalPriorRefunded;

  const targetAmountMinor = amountMinor ?? remainingRefundable;

  if (targetAmountMinor <= 0) {
    throw new ApiError(422, "Payment is already fully refunded.");
  }

  if (targetAmountMinor > remainingRefundable) {
    throw new ApiError(
      422,
      `Requested refund of ${targetAmountMinor} minor units exceeds remaining refundable balance of ${remainingRefundable} minor units.`
    );
  }

  // 4. Create initial Refund document with status REQUESTED
  const refund = await Refund.create({
    paymentId: payment._id,
    poolId: payment.poolId,
    contributionId: payment.contributionId,
    shopId: payment.shopId,
    recipientUserId: payment.payerUserId,
    amountMinor: targetAmountMinor,
    currency: payment.currency,
    reason,
    idempotencyKey,
    status: "REQUESTED",
    isTestTransaction: payment.isTestTransaction,
    metadata,
  });

  // 5. Notify REFUND_INITIATED
  await safeSendNotification({
    recipientUserId: payment.payerUserId,
    type: "REFUND_INITIATED",
    title: "Refund Initiated",
    message: `A refund of ${targetAmountMinor} ${payment.currency} has been initiated for reason: ${reason}.`,
    resourceType: "REFUND",
    resourceId: refund._id,
    poolId: payment.poolId,
  });

  // 6. Transition to PROCESSING
  await Refund.findByIdAndUpdate(refund._id, { status: "PROCESSING" });

  // 7. Call PayPal Adapter
  const adapter = getPayPalAdapter();
  let adapterResult;

  try {
    adapterResult = await adapter.refundCapture({
      providerCaptureId: payment.providerCaptureId,
      amountMinor: targetAmountMinor,
      currency: payment.currency,
      idempotencyKey,
      reason,
    });
  } catch (err) {
    // Transition to FAILED on error
    const failedRefund = await Refund.findByIdAndUpdate(
      refund._id,
      {
        status: "FAILED",
        failureReason: err.message,
      },
      { returnDocument: "after" }
    );

    await safeSendNotification({
      recipientUserId: payment.payerUserId,
      type: "REFUND_FAILED",
      title: "Refund Failed",
      message: `Your refund of ${targetAmountMinor} ${payment.currency} failed: ${err.message}`,
      resourceType: "REFUND",
      resourceId: refund._id,
      poolId: payment.poolId,
    });

    await safeLogAudit({
      actorId: requesterUserId,
      actorRole: "SYSTEM_SCHEDULER",
      action: "REFUND_FAILED",
      resourceType: "REFUND",
      resourceId: refund._id,
      poolId: payment.poolId,
      metadata: { error: err.message, amountMinor: targetAmountMinor },
    });

    throw new ApiError(502, `Payment provider refund failed: ${err.message}`);
  }

  // 8. Update Refund to COMPLETED
  const completedRefund = await Refund.findByIdAndUpdate(
    refund._id,
    {
      status: "COMPLETED",
      providerRefundId: adapterResult.providerRefundId,
      providerResponseSnapshot: adapterResult.rawResponse,
    },
    { returnDocument: "after" }
  );

  // 9. Update Payment status (REFUNDED vs PARTIALLY_REFUNDED)
  const totalNowRefunded = totalPriorRefunded + targetAmountMinor;
  const newPaymentStatus =
    totalNowRefunded >= payment.amountMinor ? "REFUNDED" : "PARTIALLY_REFUNDED";

  const updatedPayment = await Payment.findByIdAndUpdate(
    payment._id,
    { paymentStatus: newPaymentStatus },
    { returnDocument: "after" }
  );

  // 10. Update Contribution totalRefundedMinor and state
  const Contribution = getContribution();
  const contributionUpdate = {
    $inc: { totalRefundedMinor: targetAmountMinor },
  };

  if (reason === "BUYER_WITHDRAWAL") {
    contributionUpdate.state = "WITHDRAWN";
  } else if (reason === "POOL_CANCELLED" || reason === "SUPPLIER_REJECTED") {
    contributionUpdate.state = "REFUNDED";
  } else if (reason === "UNDER_MOQ_BUYER_CANCEL" || reason === "UNDER_MOQ_NO_RESPONSE") {
    contributionUpdate.state = "CANCELLED_UNDER_MOQ";
  }

  await Contribution.findByIdAndUpdate(payment.contributionId, contributionUpdate);

  // 11. Dispatches
  await safeSendNotification({
    recipientUserId: payment.payerUserId,
    type: "REFUND_COMPLETED",
    title: "Refund Completed",
    message: `Your refund of ${targetAmountMinor} ${payment.currency} has been processed successfully.`,
    resourceType: "REFUND",
    resourceId: refund._id,
    poolId: payment.poolId,
  });

  await safeLogAudit({
    actorId: requesterUserId,
    actorRole: "SYSTEM_SCHEDULER",
    action: "REFUND_COMPLETED",
    resourceType: "REFUND",
    resourceId: refund._id,
    poolId: payment.poolId,
    metadata: {
      providerRefundId: adapterResult.providerRefundId,
      amountMinor: targetAmountMinor,
      reason,
    },
  });

  return { refund: completedRefund, payment: updatedPayment, isDuplicate: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. processTierDropSavingsRefunds
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculates and automatically issues tier-drop savings refunds when a
 * PAY_AT_JOIN pool locks at a lower bulk tier unit price.
 *
 * @param {object} params
 * @param {string} params.poolId
 * @param {string} params.priceSnapshotId
 * @returns {Promise<{ processedCount: number, totalRefundedMinor: number, refunds: object[] }>}
 */
export async function processTierDropSavingsRefunds({ poolId, priceSnapshotId }) {
  const PriceSnapshot = getPriceSnapshot();
  const Contribution = getContribution();

  const snapshot = await PriceSnapshot.findById(priceSnapshotId);
  if (!snapshot) {
    throw new ApiError(404, `PriceSnapshot not found: ${priceSnapshotId}`);
  }

  // Find all ACTIVE contributions in the pool that paid
  const contributions = await Contribution.find({
    poolId,
    state: "ACTIVE",
    totalPaidMinor: { $gt: 0 },
  });

  const executedRefunds = [];
  let totalRefundedMinor = 0;

  for (const contribution of contributions) {
    const memberShare = snapshot.memberShares?.find(
      (s) => s.contributionId?.toString() === contribution._id.toString()
    );

    if (!memberShare) continue;

    const expectedPayable = memberShare.totalPayableMinor;
    const netPaid = contribution.totalPaidMinor - (contribution.totalRefundedMinor || 0);

    if (netPaid > expectedPayable) {
      const savingsRefundMinor = netPaid - expectedPayable;

      // Find the payment to refund against
      const payment = await Payment.findOne({
        contributionId: contribution._id,
        paymentStatus: { $in: ["PAID", "PARTIALLY_REFUNDED"] },
      }).sort({ createdAt: -1 });

      if (!payment) continue;

      const idempotencyKey = `tier-savings-${priceSnapshotId}-${contribution._id}`;

      const refundResult = await initiateRefund({
        paymentId: payment._id.toString(),
        amountMinor: savingsRefundMinor,
        reason: "TIER_PRICE_DROP_SAVINGS",
        idempotencyKey,
        requesterUserId: contribution.createdByUserId.toString(),
        metadata: {
          priceSnapshotId,
          poolId,
          expectedPayable,
          netPaidBefore: netPaid,
        },
      });

      if (!refundResult.isDuplicate) {
        // Record verified savings on contribution
        await Contribution.findByIdAndUpdate(contribution._id, {
          verifiedSavingsMinor: savingsRefundMinor,
        });

        executedRefunds.push(refundResult.refund);
        totalRefundedMinor += savingsRefundMinor;
      }
    }
  }

  return {
    processedCount: executedRefunds.length,
    totalRefundedMinor,
    refunds: executedRefunds,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. listRefundsForShop
// ─────────────────────────────────────────────────────────────────────────────

export async function listRefundsForShop(shopId, { page = 1, limit = 20 } = {}) {
  const safePage = Math.max(1, parseInt(page, 10));
  const safeLimit = Math.min(50, Math.max(1, parseInt(limit, 10)));
  const skip = (safePage - 1) * safeLimit;

  const [refunds, total] = await Promise.all([
    Refund.find({ shopId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .select("-providerResponseSnapshot")
      .lean(),
    Refund.countDocuments({ shopId }),
  ]);

  return { refunds, total, page: safePage, limit: safeLimit };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. getRefundById
// ─────────────────────────────────────────────────────────────────────────────

export async function getRefundById(refundId, requestingUser = null) {
  const refund = await Refund.findById(refundId);
  if (!refund) {
    throw new ApiError(404, `Refund not found: ${refundId}`);
  }

  // Ownership Guard: if requestingUser is provided and role is SHOP_OWNER
  if (requestingUser && requestingUser.role === "SHOP_OWNER") {
    const isPayer = refund.recipientUserId?.toString() === requestingUser._id?.toString();
    const isShop = requestingUser.shopId && refund.shopId?.toString() === requestingUser.shopId.toString();
    if (!isPayer && !isShop) {
      throw new ApiError(403, "You are not authorised to view this refund.");
    }
  }

  return refund;
}

export default {
  initiateRefund,
  processTierDropSavingsRefunds,
  listRefundsForShop,
  getRefundById,
};
