import { asyncHandler } from "../utils/asyncHandler.js";
import { APIResponse } from "../utils/apiResponse.js";
import { ApiError } from "../utils/apiError.js";
import { Order } from "../models/Order.model.js";
import {
  generatePurchaseOrderSummary,
  verifyOrderAuthorization,
} from "../services/orders/order.service.js";

/**
 * Task SRU-06: GET /api/orders/:id/po-summary
 *
 * Downloads or retrieves structured Purchase Order document summary.
 * Supports both JSON and printable HTML output.
 *
 * Authorization:
 *  - Participants (Retailer shop owners in the pool)
 *  - Assigned Wholesaler / Supplier
 *  - Platform Admins and Reviewers
 *  - Non-participants receive 403 Forbidden.
 */
export const getPoSummary = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    throw new ApiError(400, "Order ID is required.");
  }

  // Determine requested output format
  const formatQuery = req.query.format?.toLowerCase();
  const acceptHeader = req.headers.accept?.toLowerCase();
  const format =
    formatQuery === "html" || (!formatQuery && acceptHeader?.includes("text/html"))
      ? "html"
      : "json";

  const result = await generatePurchaseOrderSummary(id, req.user, { format });

  if (format === "html") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(result.html);
  }

  return res.status(200).json(
    new APIResponse(
      200,
      result.summary,
      "Purchase Order summary generated successfully."
    )
  );
});

/**
 * GET /api/orders/:id
 * Fetches order details with role-based authorization check.
 */
export const getOrderById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const order = await Order.findById(id)
    .populate("supplierId")
    .populate("productId")
    .populate("priceSnapshotId")
    .populate("poolId")
    .lean();

  if (!order) {
    throw new ApiError(404, `Order ${id} not found.`);
  }

  // Authorize caller
  verifyOrderAuthorization(order, req.user);

  return res.status(200).json(
    new APIResponse(200, order, "Order retrieved successfully.")
  );
});

/**
 * GET /api/orders
 * Lists orders accessible to the requesting user.
 */
export const listOrders = asyncHandler(async (req, res) => {
  const user = req.user;
  const filter = {};

  if (user?.role === "SHOP_OWNER" || !user?.role) {
    const shopId = user?.shopId || user?.shop?._id || user?.shop;
    if (shopId) {
      filter["memberOrders.shopId"] = shopId;
    }
  } else if (user?.role === "SUPPLIER") {
    const supplierId = user?.supplierId || user?._id;
    if (supplierId) {
      filter.supplierId = supplierId;
    }
  }
  // Admins & Reviewers see all orders

  const orders = await Order.find(filter)
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return res.status(200).json(
    new APIResponse(200, orders, "Orders retrieved successfully.")
  );
});
