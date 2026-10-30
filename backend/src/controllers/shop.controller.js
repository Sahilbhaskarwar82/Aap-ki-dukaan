import { Shop } from "../models/Shop.model.js";
import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * Fetch the authenticated user's shop profile.
 * GET /api/shops/me
 */
export const getMyShop = asyncHandler(async (req, res) => {
  const shop = await Shop.findOne({ ownerUserId: req.user._id });
  if (!shop) {
    throw new ApiError(404, "Shop profile not found for this user account.", ["SHOP_NOT_FOUND"]);
  }

  return res.status(200).json(new ApiResponse(200, shop, "Shop profile fetched successfully."));
});

/**
 * Update the authenticated user's shop profile.
 * PATCH /api/shops/me
 */
export const updateMyShop = asyncHandler(async (req, res) => {
  const shop = await Shop.findOne({ ownerUserId: req.user._id });
  if (!shop) {
    throw new ApiError(404, "Shop profile not found.", ["SHOP_NOT_FOUND"]);
  }

  const allowedFields = [
    "name",
    "businessType",
    "deliveryArea",
    "deliveryAddress",
    "contactDetails",
    "preferredCurrency",
  ];

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      if (field === "deliveryAddress") {
        shop.deliveryAddress = {
          street: req.body.deliveryAddress.street ?? shop.deliveryAddress.street,
          city: req.body.deliveryAddress.city ?? shop.deliveryAddress.city,
          state: req.body.deliveryAddress.state ?? shop.deliveryAddress.state,
          postalCode: req.body.deliveryAddress.postalCode ?? shop.deliveryAddress.postalCode,
          country: req.body.deliveryAddress.country ?? shop.deliveryAddress.country,
        };
      } else if (field === "contactDetails") {
        shop.contactDetails = {
          phone: req.body.contactDetails.phone ?? shop.contactDetails?.phone,
          whatsapp: req.body.contactDetails.whatsapp ?? shop.contactDetails?.whatsapp,
          gstin: req.body.contactDetails.gstin ?? shop.contactDetails?.gstin,
        };
      } else {
        shop[field] = req.body[field];
      }
    }
  }

  await shop.save();

  return res.status(200).json(new ApiResponse(200, shop, "Shop profile updated successfully."));
});

/**
 * Fetch a specific shop profile with strict ownership verification.
 * GET /api/shops/:shopId
 */
export const getShopById = asyncHandler(async (req, res) => {
  const { shopId } = req.params;

  const shop = await Shop.findById(shopId);
  if (!shop) {
    throw new ApiError(404, "Shop not found.", ["SHOP_NOT_FOUND"]);
  }

  // Cross-shop access guard: only the owner or an ADMIN may view full shop details
  const isOwner = shop.ownerUserId.toString() === req.user._id.toString();
  const isAdmin = req.user.role === "ADMIN";

  if (!isOwner && !isAdmin) {
    throw new ApiError(
      403,
      "Access forbidden: you do not have permission to inspect another retailer's private profile.",
      ["SHOP_ACCESS_FORBIDDEN"]
    );
  }

  return res.status(200).json(new ApiResponse(200, shop, "Shop details retrieved successfully."));
});

export default {
  getMyShop,
  updateMyShop,
  getShopById,
};

