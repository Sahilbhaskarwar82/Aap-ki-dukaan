import mongoose from "mongoose";
import { GroupBuyPool } from "../../models/GroupBuyPool.model.js";
import { Contribution } from "../../models/Contribution.model.js";
import { getOfferMoqRules, validateContributionQuantity } from "../pricing/moqValidator.service.js";
import { freezePriceSnapshot } from "../pricing/snapshot.service.js";
import clockService from "../clock/clock.service.js";
import env from "../../config/env.js";
import { ApiError } from "../../utils/apiError.js";

/**
 * Creates a new Group-Buy Pool and initializes the 72-hour countdown timer.
 *
 * @param {Object} poolData
 * @param {string|ObjectId} userId
 * @param {ClientSession|null} [session=null]
 * @returns {Promise<GroupBuyPool>}
 */
export const createPool = async (poolData, userId, session = null) => {
  const opts = session ? { session } : {};

  // Derive authoritative MOQ and Step numbers
  const moqRules = getOfferMoqRules(poolData);

  const publishedAt = clockService.now();
  const poolHours = env.POOL_DURATION_HOURS || 72;
  const deadline = new Date(publishedAt.getTime() + poolHours * 60 * 60 * 1000);

  const [pool] = await GroupBuyPool.create(
    [
      {
        title: poolData.title.trim(),
        productId: poolData.productId,
        supplierOfferId: poolData.supplierOfferId,
        activeQuoteId: poolData.activeQuoteId || null,
        deliveryArea: poolData.deliveryArea.trim(),
        currency: poolData.currency || "INR",
        packUnit: poolData.packUnit || "UNIT",
        targetMoq: moqRules.wholesalerMoq,
        retailerMoqPercentage: moqRules.retailerMoqPercent,
        retailerStepPercentage: moqRules.retailerStepPercent,
        minRetailerQuantity: moqRules.retailerMoq,
        quantityStepMultiple: moqRules.stepMultiple,
        baseUnitPriceMinor: poolData.baseUnitPriceMinor,
        currentUnitPriceMinor: poolData.baseUnitPriceMinor,
        shippingCostMinor: poolData.shippingCostMinor ?? null,
        shippingAllocationMethod: poolData.shippingAllocationMethod || "PER_UNIT",
        paymentPolicy: poolData.paymentPolicy || "PAY_AT_JOIN",
        publishedAt,
        deadline,
        state: "RECRUITING",
        totalEligibleQuantity: 0,
        participantCount: 0,
        createdByUserId: userId,
      },
    ],
    opts
  );

  return pool;
};

/**
 * Retrieves pools matching query filters.
 */
export const listPools = async (filters = {}) => {
  const query = {};
  if (filters.state) query.state = filters.state;
  if (filters.deliveryArea) query.deliveryArea = filters.deliveryArea;
  if (filters.productId) query.productId = filters.productId;

  return await GroupBuyPool.find(query).sort({ createdAt: -1 });
};

/**
 * Retrieves pool detail by ID along with its active member summary.
 */
export const getPoolDetail = async (poolId) => {
  const pool = await GroupBuyPool.findById(poolId)
    .populate("productId")
    .populate("latestPriceSnapshotId");

  if (!pool) {
    throw new ApiError(404, "GroupBuyPool not found.", ["POOL_NOT_FOUND"]);
  }

  const contributions = await Contribution.find({
    poolId,
    state: { $in: ["ACTIVE", "PENDING_PAYMENT", "FINALIZED"] },
  }).select("-roundingAdjustmentMinor");

  return { pool, contributions };
};

/**
 * Validates and commits a retailer's contribution to join a group-buy pool.
 */
export const joinPool = async (
  { poolId, shopId, requirementId = null, quantity, unit, userId },
  session = null
) => {
  const opts = session ? { session } : {};

  const pool = await GroupBuyPool.findById(poolId).session(session);
  if (!pool) {
    throw new ApiError(404, "GroupBuyPool not found.", ["POOL_NOT_FOUND"]);
  }

  // Enforce pool open lifecycle guards
  if (pool.state !== "RECRUITING") {
    throw new ApiError(
      409,
      `Cannot join pool in state [${pool.state}]. Pools accept participants only when RECRUITING.`,
      ["POOL_NOT_RECRUITING"]
    );
  }

  if (clockService.now() >= pool.deadline) {
    throw new ApiError(409, "Pool 72-hour deadline has expired.", ["POOL_EXPIRED"]);
  }

  // Validate quantity against MOQ_R and Step rules
  validateContributionQuantity(quantity, pool);

  // Check unique active contribution per shop in this pool
  const existing = await Contribution.findOne({
    poolId,
    shopId,
    state: { $in: ["PENDING_PAYMENT", "ACTIVE", "FINALIZED"] },
  }).session(session);

  if (existing) {
    throw new ApiError(
      409,
      "Your shop already has an active or pending contribution in this pool.",
      ["DUPLICATE_CONTRIBUTION"]
    );
  }

  const q = Number(quantity);
  const unitPrice = pool.currentUnitPriceMinor;
  const merchandiseShare = q * unitPrice;

  const [contribution] = await Contribution.create(
    [
      {
        poolId,
        shopId,
        requirementId,
        createdByUserId: userId,
        quantity: q,
        unit: unit || pool.packUnit,
        unitPriceMinor: unitPrice,
        estimatedMerchandiseShareMinor: merchandiseShare,
        finalTotalPayableMinor: merchandiseShare,
        state: pool.paymentPolicy === "PAY_AT_JOIN" ? "PENDING_PAYMENT" : "ACTIVE",
        approvalStatus: "NOT_REQUIRED_YET",
      },
    ],
    opts
  );

  // If pool payment policy is not pay-at-join, immediately recalculate pool
  if (contribution.state === "ACTIVE") {
    await recalculatePool(poolId, session);
  }

  return contribution;
};

/**
 * Updates a participant's committed quantity before pool lock.
 */
export const updateContributionQuantity = async (
  { poolId, contributionId, shopId, newQuantity, userId },
  session = null
) => {
  const opts = session ? { session } : {};

  const pool = await GroupBuyPool.findById(poolId).session(session);
  if (!pool) throw new ApiError(404, "Pool not found.", ["POOL_NOT_FOUND"]);

  // Guard: edits are permitted ONLY while recruiting, before MOQ_W is reached, and before deadline
  if (pool.state !== "RECRUITING" || clockService.now() >= pool.deadline) {
    throw new ApiError(
      409,
      "Contribution quantity can only be modified while the pool is in open RECRUITING state before the 72h deadline.",
      ["POOL_LOCKED_CANNOT_EDIT"]
    );
  }

  const contribution = await Contribution.findById(contributionId).session(session);
  if (!contribution || contribution.poolId.toString() !== poolId.toString()) {
    throw new ApiError(404, "Contribution not found.", ["CONTRIBUTION_NOT_FOUND"]);
  }

  if (contribution.shopId.toString() !== shopId.toString()) {
    throw new ApiError(403, "You can only edit contributions owned by your shop.", ["SHOP_MISMATCH"]);
  }

  // Validate new quantity
  validateContributionQuantity(newQuantity, pool);

  const oldQuantity = contribution.quantity;
  const newQ = Number(newQuantity);
  const deltaQuantity = newQ - oldQuantity;

  contribution.quantity = newQ;
  contribution.estimatedMerchandiseShareMinor = newQ * contribution.unitPriceMinor;
  contribution.finalTotalPayableMinor = contribution.estimatedMerchandiseShareMinor + contribution.estimatedShippingShareMinor;
  await contribution.save(opts);

  if (contribution.state === "ACTIVE") {
    await recalculatePool(poolId, session);
  }

  return {
    contribution,
    deltaQuantity,
    deltaAmountMinor: deltaQuantity * contribution.unitPriceMinor,
  };
};

/**
 * Withdraws a participant's contribution before pool lock.
 */
export const withdrawContribution = async (
  { poolId, contributionId, shopId, userId },
  session = null
) => {
  const opts = session ? { session } : {};

  const pool = await GroupBuyPool.findById(poolId).session(session);
  if (!pool) throw new ApiError(404, "Pool not found.", ["POOL_NOT_FOUND"]);

  // Guard: withdrawals permitted ONLY before lock and before deadline
  if (pool.state !== "RECRUITING" || clockService.now() >= pool.deadline) {
    throw new ApiError(
      409,
      "Withdrawals are strictly forbidden after pool lock or 72-hour deadline expiry.",
      ["POOL_LOCKED_CANNOT_WITHDRAW"]
    );
  }

  const contribution = await Contribution.findById(contributionId).session(session);
  if (!contribution || contribution.poolId.toString() !== poolId.toString()) {
    throw new ApiError(404, "Contribution not found.", ["CONTRIBUTION_NOT_FOUND"]);
  }

  if (contribution.shopId.toString() !== shopId.toString()) {
    throw new ApiError(403, "You can only withdraw contributions owned by your shop.", ["SHOP_MISMATCH"]);
  }

  contribution.state = "WITHDRAWN";
  contribution.withdrawnAt = clockService.now();
  await contribution.save(opts);

  await recalculatePool(poolId, session);

  return {
    contribution,
    refundRequired: contribution.totalPaidMinor > 0,
    refundAmountMinor: contribution.totalPaidMinor,
  };
};

/**
 * Atomically recalculates pool eligible quantity, participant count, and early MOQ lock.
 */
export const recalculatePool = async (poolId, session = null) => {
  const opts = session ? { session } : {};

  const pool = await GroupBuyPool.findById(poolId).session(session);
  if (!pool) return;

  const activeContributions = await Contribution.find({
    poolId,
    state: "ACTIVE",
  }).session(session);

  const totalEligibleQuantity = activeContributions.reduce((sum, c) => sum + c.quantity, 0);
  const participantCount = activeContributions.length;

  pool.totalEligibleQuantity = totalEligibleQuantity;
  pool.participantCount = participantCount;

  // Early MOQ Lock condition: Q_pool >= MOQ_W
  if (totalEligibleQuantity >= pool.targetMoq && pool.state === "RECRUITING") {
    pool.state = "AWAITING_APPROVALS";
    pool.lockedAt = clockService.now();
    pool.lockReason = "MOQ_REACHED_EARLY";
    await pool.save(opts);

    // Freeze authoritative PriceSnapshot
    await freezePriceSnapshot(poolId, session);
  } else {
    await pool.save(opts);
  }

  return pool;
};

export default {
  createPool,
  listPools,
  getPoolDetail,
  joinPool,
  updateContributionQuantity,
  withdrawContribution,
  recalculatePool,
};
