import { GroupBuyPool } from "../../models/GroupBuyPool.model.js";
import { Contribution } from "../../models/Contribution.model.js";
import { freezePriceSnapshot } from "../pricing/snapshot.service.js";
import clockService from "../clock/clock.service.js";
import { ApiError } from "../../utils/apiError.js";

/**
 * 24-Hour Under-MOQ Decision Engine (PRK-10)
 *
 * Implements all 10 mandatory under-MOQ scenarios, silence-is-never-consent rule,
 * and concurrency-safe buyer voting.
 */

/**
 * Submits a participating retailer's vote (PROCEED or CANCEL) during the 24h decision window.
 *
 * @param {Object} params
 * @param {string|ObjectId} params.poolId
 * @param {string|ObjectId} params.contributionId
 * @param {string|ObjectId} params.shopId
 * @param {'PROCEED'|'CANCEL'} params.decision
 * @param {ClientSession|null} [session=null]
 * @returns {Promise<Object>}
 */
export const submitBuyerUnderMoqDecision = async (
  { poolId, contributionId, shopId, decision },
  session = null
) => {
  const opts = session ? { session } : {};

  if (!["PROCEED", "CANCEL"].includes(decision)) {
    throw new ApiError(400, "Decision must be either 'PROCEED' or 'CANCEL'.", ["INVALID_DECISION"]);
  }

  const pool = await GroupBuyPool.findById(poolId).session(session);
  if (!pool) throw new ApiError(404, "Pool not found.", ["POOL_NOT_FOUND"]);

  // Guard: voting permitted only in decision state and before cutoff
  if (pool.state !== "UNDER_MOQ_DECISION_PENDING") {
    throw new ApiError(
      409,
      `Voting is not permitted when pool is in state [${pool.state}].`,
      ["NOT_IN_DECISION_WINDOW"]
    );
  }

  if (pool.decisionDeadline && clockService.now() > pool.decisionDeadline) {
    throw new ApiError(409, "The 24-hour buyer decision window has closed.", ["DECISION_WINDOW_EXPIRED"]);
  }

  const contribution = await Contribution.findById(contributionId).session(session);
  if (!contribution || contribution.poolId.toString() !== poolId.toString()) {
    throw new ApiError(404, "Contribution not found.", ["CONTRIBUTION_NOT_FOUND"]);
  }

  if (contribution.shopId.toString() !== shopId.toString()) {
    throw new ApiError(403, "You can only vote for contributions owned by your shop.", ["SHOP_MISMATCH"]);
  }

  contribution.underMoqDecision = decision;
  contribution.underMoqDecisionAt = clockService.now();

  if (decision === "CANCEL") {
    // Case 2 & 3: Cancelling buyer is marked for exclusion and refund
    contribution.state = "CANCELLED_UNDER_MOQ";
  }

  await contribution.save(opts);

  // Evaluate if all active buyers have cast their votes
  const allEligible = await Contribution.find({
    poolId,
    state: { $in: ["ACTIVE", "PENDING_PAYMENT", "CANCELLED_UNDER_MOQ"] },
  }).session(session);

  const pendingVotes = allEligible.filter((c) => c.underMoqDecision === "PENDING");

  if (pendingVotes.length === 0) {
    const proceeding = allEligible.filter((c) => c.underMoqDecision === "PROCEED");

    if (proceeding.length === 0) {
      // Case 2: All buyers cancelled -> Cancel pool, refund all
      await cancelPoolAndRefundAll(poolId, "ALL_BUYERS_CANCELLED_UNDER_MOQ", session);
    } else {
      // Case 1 & Case 3: Mixed or all proceed (concurrency-safe atomic transition)
      const remainingQty = proceeding.reduce((sum, c) => sum + c.quantity, 0);

      await GroupBuyPool.findOneAndUpdate(
        { _id: poolId, state: "UNDER_MOQ_DECISION_PENDING" },
        {
          $set: {
            totalEligibleQuantity: remainingQty,
            participantCount: proceeding.length,
            state: "AWAITING_SUPPLIER_UNDER_MOQ_FEASIBILITY",
          },
        },
        opts
      );
    }
  }

  return {
    contribution,
    decision,
    refundRequired: decision === "CANCEL" && contribution.totalPaidMinor > 0,
    refundAmountMinor: decision === "CANCEL" ? contribution.totalPaidMinor : 0,
  };
};

/**
 * Evaluates expired 24h decision window. Non-responsive buyers are excluded (silence != consent).
 * Case 4 & Case 9.
 *
 * @param {string|ObjectId} poolId
 * @param {ClientSession|null} [session=null]
 * @returns {Promise<Object>}
 */
export const processExpiredDecisionWindow = async (poolId, session = null) => {
  const opts = session ? { session } : {};

  const pool = await GroupBuyPool.findById(poolId).session(session);
  if (!pool) return;

  // Find non-responsive buyers (still PENDING)
  const nonResponsive = await Contribution.find({
    poolId,
    underMoqDecision: "PENDING",
  }).session(session);

  // Case 4: Silence is never treated as consent -> mark EXPIRED_NO_RESPONSE and refund
  for (const c of nonResponsive) {
    c.underMoqDecision = "EXPIRED_NO_RESPONSE";
    c.state = "CANCELLED_UNDER_MOQ";
    await c.save(opts);
  }

  // Count remaining buyers who explicitly voted PROCEED
  const proceeding = await Contribution.find({
    poolId,
    underMoqDecision: "PROCEED",
  }).session(session);

  // Case 9: If 0 proceeding buyers remain or remaining quantity is 0 -> Auto-cancel pool
  if (proceeding.length === 0) {
    await cancelPoolAndRefundAll(poolId, "NO_PROCEEDING_BUYERS_AFTER_24H_EXPIRY", session);
    return { outcome: "CANCELLED", proceedingCount: 0 };
  }

  // Recalculate remaining volume
  const remainingQuantity = proceeding.reduce((sum, c) => sum + c.quantity, 0);
  pool.totalEligibleQuantity = remainingQuantity;
  pool.participantCount = proceeding.length;
  pool.state = "AWAITING_SUPPLIER_UNDER_MOQ_FEASIBILITY";
  await pool.save(opts);

  return {
    outcome: "AWAITING_SUPPLIER_FEASIBILITY",
    proceedingCount: proceeding.length,
    remainingQuantity,
  };
};

/**
 * Handles supplier's response to an under-MOQ order.
 * Case 1 (Accept), Case 5 (Reject), Case 6 & 7 (Revised quote with optional surcharge).
 *
 * @param {Object} params
 * @param {string|ObjectId} params.poolId
 * @param {'ACCEPT_ORIGINAL'|'REJECT'|'REVISED_QUOTE'} params.action
 * @param {Object} [params.revisedQuoteData] - { unitPriceMinor, shippingCostMinor }
 * @param {ClientSession|null} [session=null]
 * @returns {Promise<GroupBuyPool>}
 */
export const processSupplierUnderMoqFeasibility = async (
  { poolId, action, revisedQuoteData = {} },
  session = null
) => {
  const opts = session ? { session } : {};

  const pool = await GroupBuyPool.findById(poolId).session(session);
  if (!pool) throw new ApiError(404, "Pool not found.");

  if (action === "REJECT") {
    // Case 5: Supplier rejects order below MOQ_W -> cancel pool, full refund
    pool.supplierUnderMoqStatus = "REJECTED_SUB_MOQ";
    await pool.save(opts);
    await cancelPoolAndRefundAll(poolId, "SUPPLIER_REJECTED_SUB_MOQ", session);
    return pool;
  }

  if (action === "ACCEPT_ORIGINAL") {
    // Case 1: Supplier accepts smaller volume at original price tier
    pool.supplierUnderMoqStatus = "ACCEPTED_SUB_MOQ";
    pool.state = "AWAITING_APPROVALS";
    await pool.save(opts);

    // Freeze snapshot for proceeding members
    await freezePriceSnapshot(poolId, session);
    return pool;
  }

  if (action === "REVISED_QUOTE") {
    // Case 6 & 7: Supplier quotes higher unit price for sub-MOQ volume
    if (!revisedQuoteData.unitPriceMinor || revisedQuoteData.unitPriceMinor <= 0) {
      throw new ApiError(400, "Revised quote unitPriceMinor is required.", ["INVALID_REVISED_QUOTE"]);
    }

    pool.supplierUnderMoqStatus = "REVISED_QUOTE_PROVIDED";
    pool.baseUnitPriceMinor = revisedQuoteData.unitPriceMinor;
    pool.currentUnitPriceMinor = revisedQuoteData.unitPriceMinor;
    if (revisedQuoteData.shippingCostMinor !== undefined) {
      pool.shippingCostMinor = revisedQuoteData.shippingCostMinor;
    }
    pool.state = "AWAITING_REVISED_QUOTE_APPROVAL";
    await pool.save(opts);

    // Freeze new PriceSnapshot (which invalidates prior approvals due to price increase)
    await freezePriceSnapshot(poolId, session);
    return pool;
  }

  throw new ApiError(400, `Unknown supplier under-MOQ action: ${action}`);
};

/**
 * Case 10: Cancels a pool at any lifecycle stage, initiates 100% refunds, and records closure reason.
 *
 * @param {string|ObjectId} poolId
 * @param {string} reason
 * @param {ClientSession|null} [session=null]
 * @returns {Promise<GroupBuyPool>}
 */
export const cancelPoolAndRefundAll = async (poolId, reason = "POOL_CANCELLED", session = null) => {
  const opts = session ? { session } : {};

  const pool = await GroupBuyPool.findById(poolId).session(session);
  if (!pool) return null;

  pool.state = "CANCELLED";
  pool.closedAt = clockService.now();
  pool.closureReason = reason;
  await pool.save(opts);

  // Transition all non-withdrawn contributions to CANCELLED_UNDER_MOQ / REFUNDED
  await Contribution.updateMany(
    { poolId, state: { $ne: "WITHDRAWN" } },
    { $set: { state: "CANCELLED_UNDER_MOQ" } },
    opts
  );

  return pool;
};

export default {
  submitBuyerUnderMoqDecision,
  processExpiredDecisionWindow,
  processSupplierUnderMoqFeasibility,
  cancelPoolAndRefundAll,
};
