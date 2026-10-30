import {
  createPool,
  listPools,
  getPoolDetail,
  joinPool,
  updateContributionQuantity,
  withdrawContribution,
} from "../services/groupBuy/poolLifecycle.service.js";
import { approvePriceSnapshot } from "../services/pricing/snapshot.service.js";
import {
  submitBuyerUnderMoqDecision,
  processSupplierUnderMoqFeasibility,
} from "../services/groupBuy/underMoqDecision.service.js";
import { Contribution } from "../models/Contribution.model.js";
import { APIResponse, ApiResponse } from "../utils/apiResponse.js";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * Create a new group-buy pool.
 * POST /api/pools
 */
export const handleCreatePool = asyncHandler(async (req, res) => {
  const pool = await createPool(req.body, req.user._id);
  return res.status(201).json(new APIResponse(201, pool, "Group-buy pool created successfully."));
});

/**
 * List pools with query filters.
 * GET /api/pools
 */
export const handleListPools = asyncHandler(async (req, res) => {
  const pools = await listPools(req.query);
  return res.status(200).json(new APIResponse(200, pools, "Pools retrieved successfully."));
});

/**
 * Get pool detail by ID.
 * GET /api/pools/:poolId
 */
export const handleGetPoolDetail = asyncHandler(async (req, res) => {
  const { poolId, id } = req.params;
  const targetId = poolId || id;
  const detail = await getPoolDetail(targetId);
  return res.status(200).json(new APIResponse(200, detail, "Pool detail retrieved successfully."));
});

/**
 * Join an open recruiting pool.
 * POST /api/pools/:poolId/join or POST /api/pools/:poolId/contributions
 */
export const handleJoinPool = asyncHandler(async (req, res) => {
  const { poolId, id } = req.params;
  const targetId = poolId || id;
  if (!req.shop) {
    throw new ApiError(400, "Only registered shop owners can join group-buy pools.", ["SHOP_REQUIRED"]);
  }

  const contribution = await joinPool({
    poolId: targetId,
    shopId: req.shop._id,
    requirementId: req.body.requirementId,
    quantity: req.body.quantity,
    unit: req.body.unit,
    acceptSubstitution: req.body.acceptSubstitution,
    userId: req.user._id,
  });

  return res.status(201).json(new APIResponse(201, contribution, "Joined group-buy pool successfully."));
});

/**
 * Edit committed contribution quantity before pool lock.
 * PATCH /api/pools/:poolId/contributions/:contributionId
 */
export const handleUpdateQuantity = asyncHandler(async (req, res) => {
  const { poolId, id, contributionId } = req.params;
  const targetId = poolId || id;
  if (!req.shop) throw new ApiError(400, "Shop profile required.");

  const result = await updateContributionQuantity({
    poolId: targetId,
    contributionId,
    shopId: req.shop._id,
    newQuantity: req.body.quantity,
    userId: req.user._id,
  });

  return res.status(200).json(new APIResponse(200, result, "Contribution quantity updated."));
});

/**
 * Withdraw contribution from open pool before lock.
 * POST /api/pools/:poolId/contributions/:contributionId/withdraw
 * or DELETE /api/pools/:poolId/contributions/:contributionId
 */
export const handleWithdraw = asyncHandler(async (req, res) => {
  const { poolId, id, contributionId } = req.params;
  const targetId = poolId || id;
  if (!req.shop) throw new ApiError(400, "Shop profile required.");

  const result = await withdrawContribution({
    poolId: targetId,
    contributionId,
    shopId: req.shop._id,
    userId: req.user._id,
  });

  return res.status(200).json(new APIResponse(200, result, "Withdrawn from pool successfully."));
});

/**
 * Explicit PriceSnapshot approval.
 * POST /api/pools/:poolId/approve
 */
export const handleApproveSnapshot = asyncHandler(async (req, res) => {
  const { poolId, id } = req.params;
  const targetId = poolId || id;
  const { contributionId, snapshotId, priceSnapshotId } = req.body;

  if (!req.shop) throw new ApiError(400, "Shop profile required.");

  let resolvedContributionId = contributionId;
  if (!resolvedContributionId) {
    const activeContr = await Contribution.findOne({
      poolId: targetId,
      shopId: req.shop._id,
      status: { $nin: ["WITHDRAWN", "CANCELLED", "REFUNDED"] },
    });
    if (!activeContr) {
      throw new ApiError(404, "Active contribution not found for this shop in this pool.");
    }
    resolvedContributionId = activeContr._id;
  }

  const contribution = await approvePriceSnapshot({
    poolId: targetId,
    contributionId: resolvedContributionId,
    shopId: req.shop._id,
    snapshotId: snapshotId || priceSnapshotId,
    userId: req.user._id,
  });

  return res.status(200).json(new APIResponse(200, contribution, "Price snapshot approved."));
});

/**
 * Submit 24h Under-MOQ buyer decision (PROCEED / CANCEL).
 * POST /api/pools/:poolId/decision
 */
export const handleUnderMoqDecision = asyncHandler(async (req, res) => {
  const { poolId, id } = req.params;
  const targetId = poolId || id;
  const { decision, contributionId } = req.body;

  if (!req.shop) throw new ApiError(400, "Shop profile required.");
  if (!decision || !["PROCEED", "CANCEL"].includes(decision)) {
    throw new ApiError(400, "A valid decision ('PROCEED' or 'CANCEL') is required.");
  }

  let resolvedContributionId = contributionId;
  if (!resolvedContributionId) {
    const activeContr = await Contribution.findOne({
      poolId: targetId,
      shopId: req.shop._id,
      status: { $nin: ["WITHDRAWN", "CANCELLED", "REFUNDED"] },
    });
    if (!activeContr) {
      throw new ApiError(404, "Active contribution not found for this shop in this pool.");
    }
    resolvedContributionId = activeContr._id;
  }

  const result = await submitBuyerUnderMoqDecision({
    poolId: targetId,
    contributionId: resolvedContributionId,
    shopId: req.shop._id,
    decision,
  });

  return res.status(200).json(new APIResponse(200, result, "Under-MOQ decision recorded successfully."));
});

/**
 * Supplier submits sub-MOQ pool feasibility resolution (ACCEPT, REVISE, REJECT).
 * POST /api/pools/:poolId/supplier-feasibility
 */
export const handleSupplierFeasibility = asyncHandler(async (req, res) => {
  const { poolId, id } = req.params;
  const targetId = poolId || id;
  const { action, revisedQuoteData } = req.body;

  if (!action || !["ACCEPT_UNDER_MOQ", "SUBMIT_REVISED_QUOTE", "REJECT"].includes(action)) {
    throw new ApiError(
      400,
      "Action must be one of: 'ACCEPT_UNDER_MOQ', 'SUBMIT_REVISED_QUOTE', or 'REJECT'."
    );
  }

  const result = await processSupplierUnderMoqFeasibility({
    poolId: targetId,
    action,
    revisedQuoteData,
  });

  return res
    .status(200)
    .json(new APIResponse(200, result, "Supplier feasibility decision processed successfully."));
});

export default {
  handleCreatePool,
  handleListPools,
  handleGetPoolDetail,
  handleJoinPool,
  handleUpdateQuantity,
  handleWithdraw,
  handleApproveSnapshot,
  handleUnderMoqDecision,
  handleSupplierFeasibility,
};
