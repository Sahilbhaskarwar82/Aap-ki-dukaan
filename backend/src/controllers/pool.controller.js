import {
  createPool,
  listPools,
  getPoolDetail,
  joinPool,
  updateContributionQuantity,
  withdrawContribution,
} from "../services/groupBuy/poolLifecycle.service.js";
import { approvePriceSnapshot } from "../services/pricing/snapshot.service.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * Create a new group-buy pool.
 * POST /api/pools
 */
export const handleCreatePool = asyncHandler(async (req, res) => {
  const pool = await createPool(req.body, req.user._id);
  return res.status(201).json(new ApiResponse(201, pool, "Group-buy pool created successfully."));
});

/**
 * List pools with query filters.
 * GET /api/pools
 */
export const handleListPools = asyncHandler(async (req, res) => {
  const pools = await listPools(req.query);
  return res.status(200).json(new ApiResponse(200, pools, "Pools retrieved successfully."));
});

/**
 * Get pool detail by ID.
 * GET /api/pools/:poolId
 */
export const handleGetPoolDetail = asyncHandler(async (req, res) => {
  const { poolId } = req.params;
  const detail = await getPoolDetail(poolId);
  return res.status(200).json(new ApiResponse(200, detail, "Pool detail retrieved successfully."));
});

/**
 * Join an open recruiting pool.
 * POST /api/pools/:poolId/join
 */
export const handleJoinPool = asyncHandler(async (req, res) => {
  const { poolId } = req.params;
  if (!req.shop) {
    throw new ApiError(400, "Only registered shop owners can join group-buy pools.", ["SHOP_REQUIRED"]);
  }

  const contribution = await joinPool({
    poolId,
    shopId: req.shop._id,
    requirementId: req.body.requirementId,
    quantity: req.body.quantity,
    unit: req.body.unit,
    userId: req.user._id,
  });

  return res.status(201).json(new ApiResponse(201, contribution, "Joined group-buy pool successfully."));
});

/**
 * Edit committed contribution quantity before pool lock.
 * PATCH /api/pools/:poolId/contributions/:contributionId
 */
export const handleUpdateQuantity = asyncHandler(async (req, res) => {
  const { poolId, contributionId } = req.params;
  if (!req.shop) throw new ApiError(400, "Shop profile required.");

  const result = await updateContributionQuantity({
    poolId,
    contributionId,
    shopId: req.shop._id,
    newQuantity: req.body.quantity,
    userId: req.user._id,
  });

  return res.status(200).json(new ApiResponse(200, result, "Contribution quantity updated."));
});

/**
 * Withdraw contribution from open pool before lock.
 * POST /api/pools/:poolId/contributions/:contributionId/withdraw
 */
export const handleWithdraw = asyncHandler(async (req, res) => {
  const { poolId, contributionId } = req.params;
  if (!req.shop) throw new ApiError(400, "Shop profile required.");

  const result = await withdrawContribution({
    poolId,
    contributionId,
    shopId: req.shop._id,
    userId: req.user._id,
  });

  return res.status(200).json(new ApiResponse(200, result, "Withdrawn from pool successfully."));
});

/**
 * Approve frozen PriceSnapshot breakdown.
 * POST /api/pools/:poolId/approve
 */
export const handleApproveSnapshot = asyncHandler(async (req, res) => {
  const { poolId } = req.params;
  const { contributionId, snapshotId } = req.body;

  if (!req.shop) throw new ApiError(400, "Shop profile required.");

  const contribution = await approvePriceSnapshot({
    poolId,
    contributionId,
    shopId: req.shop._id,
    snapshotId,
    userId: req.user._id,
  });

  return res.status(200).json(new ApiResponse(200, contribution, "Price snapshot approved."));
});

export default {
  handleCreatePool,
  handleListPools,
  handleGetPoolDetail,
  handleJoinPool,
  handleUpdateQuantity,
  handleWithdraw,
  handleApproveSnapshot,
};

