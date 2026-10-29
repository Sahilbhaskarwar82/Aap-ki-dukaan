import { asyncHandler } from "../utils/asyncHandler.js";
import { APIResponse } from "../utils/apiResponse.js";
import { ApiError } from "../utils/apiError.js";
import { Order } from "../models/Order.model.js";
import {
  generatePurchaseOrderSummary,
  verifyOrderAuthorization,
  getSupplierSettlement,
  updateSupplierSettlement,
} from "../services/orders/order.service.js";

/**
 * Task SRU-06: GET /api/orders/:id/po-summary
 *
 * Downloads or retrieves structured Purchase Order document summary.
 * Supports both JSON and printable HTML output.
 */
export const getPoSummary = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    throw new ApiError(400, "Order ID is required.");
  }

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
 * Task SRU-07: GET /api/orders/:id/settlement
 *
 * Retrieves the SupplierSettlement record for an order.
 * Restricted to Admins, Reviewers, and the assigned Supplier.
 */
export const getSettlement = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const settlement = await getSupplierSettlement(id, req.user);

  return res.status(200).json(
    new APIResponse(
      200,
      settlement,
      "Supplier settlement record retrieved successfully."
    )
  );
});

/**
 * Task SRU-07: PATCH /api/orders/:id/settlement
 *
 * Updates supplier settlement status (Admin only).
 */
export const updateSettlement = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  const settlement = await updateSupplierSettlement(id, updates, req.user);

  return res.status(200).json(
    new APIResponse(
      200,
      settlement,
      "Supplier settlement record updated successfully."
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

  const orders = await Order.find(filter)
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return res.status(200).json(
    new APIResponse(200, orders, "Orders retrieved successfully.")
  );
});
