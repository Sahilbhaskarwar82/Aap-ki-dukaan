import mongoose from "mongoose";
import { PriceSnapshot } from "../../models/PriceSnapshot.model.js";
import { GroupBuyPool } from "../../models/GroupBuyPool.model.js";
import { Contribution } from "../../models/Contribution.model.js";
import { calculatePoolPricing } from "./pricingEngine.service.js";
import clockService from "../clock/clock.service.js";
import { ApiError } from "../../utils/apiError.js";

/**
 * Freezes an immutable, versioned PriceSnapshot for a pool and calculates authoritative shares.
 *
 * @param {string|ObjectId} poolId
 * @param {ClientSession|null} [session=null]
 * @returns {Promise<PriceSnapshot>}
 */
export const freezePriceSnapshot = async (poolId, session = null) => {
  const opts = session ? { session } : {};

  const pool = await GroupBuyPool.findById(poolId).session(session);
  if (!pool) {
    throw new ApiError(404, "GroupBuyPool not found for price snapshot freeze.", ["POOL_NOT_FOUND"]);
  }

  // Find all active or paid contributions
  const contributions = await Contribution.find({
    poolId,
    state: { $in: ["ACTIVE", "FINALIZED", "PENDING_PAYMENT"] },
  }).session(session);

  if (contributions.length === 0) {
    throw new ApiError(400, "Cannot freeze PriceSnapshot for a pool with zero contributions.", [
      "NO_ACTIVE_CONTRIBUTIONS",
    ]);
  }

  // Construct offer context from pool or referenced quote
  const offerContext = {
    baseUnitPriceMinor: pool.baseUnitPriceMinor,
    unitPriceMinor: pool.currentUnitPriceMinor,
    quantityTiers: [], // Populated from supplierOffer when present, otherwise flat tier
    packUnit: pool.packUnit,
    shippingAllocationMethod: pool.shippingAllocationMethod || "PER_UNIT",
    flatShippingCostMinor: pool.shippingCostMinor,
    taxInclusion: "GST_EXCLUDED",
  };

  // If pool has quantity tiers stored or supplier offer, calculate deterministic pricing
  const pricing = calculatePoolPricing({
    offer: offerContext,
    contributions,
    baselineSource: pool.activeQuoteId ? "REVISED_SUPPLIER_QUOTE" : "OFFER_BASE_TIER",
  });

  const nextVersion = (pool.priceBreakdownVersion || 0) + 1;

  // Mark all previous snapshots for this pool as superseded
  await PriceSnapshot.updateMany(
    { poolId, isSuperseded: false },
    { $set: { isSuperseded: true } },
    opts
  );

  // Create the new authoritative versioned PriceSnapshot
  const [snapshot] = await PriceSnapshot.create(
    [
      {
        poolId,
        version: nextVersion,
        supplierOfferId: pool.supplierOfferId,
        quoteId: pool.activeQuoteId || null,
        currency: pool.currency,
        totalEligibleQuantity: pricing.totalEligibleQuantity,
        baseUnitPriceMinor: pricing.baseUnitPriceMinor,
        appliedUnitPriceMinor: pricing.appliedUnitPriceMinor,
        merchandiseTotalMinor: pricing.merchandiseTotalMinor,
        shippingCostMinor: pricing.shippingCostMinor,
        shippingStatus: pricing.shippingStatus,
        shippingAllocationMethod: pricing.shippingAllocationMethod,
        taxInclusion: pricing.taxInclusion,
        groupTotalPayableMinor: pricing.groupTotalPayableMinor,
        baselineComparisonSource: pricing.baselineComparisonSource,
        baselineTimestamp: pricing.baselineTimestamp,
        memberShares: pricing.memberShares,
        isSuperseded: false,
      },
    ],
    opts
  );

  // Update pool's price version and latest snapshot pointer
  pool.priceBreakdownVersion = nextVersion;
  pool.latestPriceSnapshotId = snapshot._id;
  pool.totalEligibleQuantity = pricing.totalEligibleQuantity;
  pool.currentUnitPriceMinor = pricing.appliedUnitPriceMinor;
  pool.estimatedMerchandiseTotalMinor = pricing.merchandiseTotalMinor;
  await pool.save(opts);

  // Update member contributions with their itemized shares and require approval
  for (const share of pricing.memberShares) {
    const contrib = contributions.find((c) => c._id.toString() === share.contributionId.toString());
    if (contrib) {
      contrib.unitPriceMinor = share.appliedUnitPriceMinor;
      contrib.estimatedMerchandiseShareMinor = share.merchandiseShareMinor;
      contrib.estimatedShippingShareMinor = share.shippingShareMinor;
      contrib.roundingAdjustmentMinor = share.roundingAdjustmentMinor;
      contrib.finalTotalPayableMinor = share.totalPayableMinor;
      contrib.verifiedSavingsMinor = share.verifiedSavingsMinor;

      // Reset approval status if pending
      if (contrib.approvalStatus !== "APPROVED") {
        contrib.approvalStatus = "PENDING_APPROVAL";
      }

      await contrib.save(opts);
    }
  }

  // Check if any previously approved contribution must be invalidated due to price increases
  await invalidateApprovalsOnMaterialChange(poolId, snapshot, session);

  return snapshot;
};

/**
 * Automatically invalidates previously approved contributions if a material cost change occurs.
 * A material cost change occurs if unit price, shipping share, or total payable increases.
 *
 * @param {string|ObjectId} poolId
 * @param {PriceSnapshot} newSnapshot
 * @param {ClientSession|null} [session=null]
 * @returns {Promise<Array<string>>} List of invalidated contribution IDs
 */
export const invalidateApprovalsOnMaterialChange = async (poolId, newSnapshot, session = null) => {
  const opts = session ? { session } : {};

  // Find the previous active snapshot prior to this version
  const previousSnapshot = await PriceSnapshot.findOne({
    poolId,
    version: newSnapshot.version - 1,
  }).session(session);

  if (!previousSnapshot) {
    return [];
  }

  const invalidatedIds = [];

  for (const currentShare of newSnapshot.memberShares) {
    const priorShare = previousSnapshot.memberShares.find(
      (m) => m.shopId.toString() === currentShare.shopId.toString()
    );

    if (priorShare) {
      const isPriceHigher = currentShare.appliedUnitPriceMinor > priorShare.appliedUnitPriceMinor;
      const isShippingHigher = currentShare.shippingShareMinor > priorShare.shippingShareMinor;
      const isTotalHigher = currentShare.totalPayableMinor > priorShare.totalPayableMinor;

      if (isPriceHigher || isShippingHigher || isTotalHigher) {
        // Find contribution and invalidate if previously approved
        const contrib = await Contribution.findById(currentShare.contributionId).session(session);
        if (contrib && contrib.approvalStatus === "APPROVED") {
          contrib.approvalStatus = "INVALIDATED_BY_CHANGE";
          contrib.approvedAt = null;
          contrib.approvedPriceSnapshotId = null;
          await contrib.save(opts);
          invalidatedIds.push(contrib._id.toString());
        }
      }
    }
  }

  return invalidatedIds;
};

/**
 * Records explicit participant approval of an itemized PriceSnapshot breakdown.
 *
 * @param {Object} params
 * @param {string|ObjectId} params.poolId
 * @param {string|ObjectId} params.contributionId
 * @param {string|ObjectId} params.shopId
 * @param {string|ObjectId} params.snapshotId
 * @param {string|ObjectId} params.userId
 * @param {ClientSession|null} [session=null]
 * @returns {Promise<Contribution>}
 */
export const approvePriceSnapshot = async (
  { poolId, contributionId, shopId, snapshotId, userId },
  session = null
) => {
  const opts = session ? { session } : {};

  const snapshot = await PriceSnapshot.findById(snapshotId).session(session);
  if (!snapshot || snapshot.poolId.toString() !== poolId.toString() || snapshot.isSuperseded) {
    throw new ApiError(
      409,
      "This price snapshot has been superseded or does not match the active pool breakdown.",
      ["SNAPSHOT_SUPERSEDED"]
    );
  }

  const contribution = await Contribution.findById(contributionId).session(session);
  if (!contribution || contribution.poolId.toString() !== poolId.toString()) {
    throw new ApiError(404, "Contribution not found in this pool.", ["CONTRIBUTION_NOT_FOUND"]);
  }

  if (contribution.shopId.toString() !== shopId.toString()) {
    throw new ApiError(403, "You can only approve snapshots for your own shop.", ["SHOP_MISMATCH"]);
  }

  // Update approval state
  contribution.approvalStatus = "APPROVED";
  contribution.approvedPriceSnapshotId = snapshot._id;
  contribution.approvedAt = clockService.now();
  await contribution.save(opts);

  // Check if all active contributions in the pool are now approved
  const allContributions = await Contribution.find({
    poolId,
    state: { $in: ["ACTIVE", "PENDING_PAYMENT"] },
  }).session(session);

  const allApproved = allContributions.every((c) => c.approvalStatus === "APPROVED");

  if (allApproved) {
    const pool = await GroupBuyPool.findById(poolId).session(session);
    if (pool && ["MOQ_REACHED", "AWAITING_APPROVALS", "UNDER_MOQ_DECISION_PENDING"].includes(pool.state)) {
      pool.state = "AWAITING_PAYMENT";
      await pool.save(opts);
    }
  }

  return contribution;
};

export default {
  freezePriceSnapshot,
  invalidateApprovalsOnMaterialChange,
  approvePriceSnapshot,
};

