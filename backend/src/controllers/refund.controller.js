import mongoose from "mongoose";
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
  if (!req.user) {
    throw new ApiError(401, "Authentication required to view refund history.");
  }

  const { page, limit, shopId: queryShopId } = req.query;
  const role = req.user.role;

  // Admin or Reviewer: can view all refunds or filter by queryShopId
  if (role === "ADMIN" || role === "REVIEWER") {
    const result = await listRefundsForShop(queryShopId || null, {
      page,
      limit,
      isAdmin: true,
    });
    return res.status(200).json(
      new APIResponse(200, result, "Refunds retrieved successfully.")
    );
  }

  // Shop Owner / Retailer: resolve shopId
  let shopId = req.shop?._id ?? req.user?.shopId;
  if (!shopId) {
    try {
      const Shop = mongoose.models?.Shop;
      if (Shop && typeof Shop.findOne === "function") {
        const shop = await Shop.findOne({ ownerUserId: req.user._id });
        if (shop) {
          shopId = shop._id;
        }
      }
    } catch {
      // ignore
    }
  }

  const result = await listRefundsForShop(shopId || null, {
    page,
    limit,
    recipientUserId: req.user._id,
  });

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
