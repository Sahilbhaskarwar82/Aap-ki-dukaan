/**
 * Refund Controller — SRU-04
 */

import { asyncHandler } from "../utils/asyncHandler.js";
import { APIResponse } from "../utils/apiResponse.js";
import { ApiError } from "../utils/apiError.js";
import {
  initiateRefund,
  processTierDropSavingsRefunds,
  listRefundsForShop,
  getRefundById,
} from "../services/refunds/refund.service.js";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/refunds/initiate
// ─────────────────────────────────────────────────────────────────────────────

export const createRefund = asyncHandler(async (req, res) => {
  const { paymentId, amountMinor, reason, idempotencyKey, metadata } = req.body;

  if (!paymentId) {
    throw new ApiError(400, "paymentId is required.");
  }
  if (!reason) {
    throw new ApiError(400, "reason is required.");
  }
  if (!idempotencyKey) {
    throw new ApiError(400, "idempotencyKey is required.");
  }

  const requesterUserId = req.user?._id;

  const result = await initiateRefund({
    paymentId,
    amountMinor,
    reason,
    idempotencyKey,
    requesterUserId,
    metadata,
  });

  const statusCode = result.isDuplicate ? 200 : 201;

  return res.status(statusCode).json(
    new APIResponse(
      statusCode,
      result,
      result.isDuplicate ? "Existing refund returned (idempotent)." : "Refund initiated successfully."
    )
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/refunds/tier-drop-savings
// ─────────────────────────────────────────────────────────────────────────────

export const triggerTierDropRefunds = asyncHandler(async (req, res) => {
  const { poolId, priceSnapshotId } = req.body;

  if (!poolId || !priceSnapshotId) {
    throw new ApiError(400, "poolId and priceSnapshotId are required.");
  }

  const result = await processTierDropSavingsRefunds({
    poolId,
    priceSnapshotId,
  });

  return res.status(200).json(
    new APIResponse(200, result, "Tier-drop savings refunds processed.")
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/refunds
// ─────────────────────────────────────────────────────────────────────────────

export const listRefunds = asyncHandler(async (req, res) => {
  const shopId = req.shop?._id ?? req.user?.shopId;
  if (!shopId) {
    throw new ApiError(403, "No shop profile associated with this account.");
  }

  const { page, limit } = req.query;
  const result = await listRefundsForShop(shopId, { page, limit });

  return res.status(200).json(
    new APIResponse(200, result, "Refunds retrieved successfully.")
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/refunds/:id
// ─────────────────────────────────────────────────────────────────────────────

export const getRefund = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const refund = await getRefundById(id, req.user);

  return res.status(200).json(
    new APIResponse(200, { refund }, "Refund details retrieved successfully.")
  );
});
