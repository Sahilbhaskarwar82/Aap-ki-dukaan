import { asyncHandler } from "../utils/asyncHandler.js";
import { APIResponse } from "../utils/apiResponse.js";
import { ApiError } from "../utils/apiError.js";
import { Order } from "../models/Order.model.js";
import {
  generatePurchaseOrderSummary,
  verifyOrderAuthorization,
  getSupplierSettlement,
  updateSupplierSettlement,
  createFinalOrderFromFundedPool,
  updateSupplierStatus,
} from "../services/orders/order.service.js";
import { getOrderActivityTimeline } from "../services/notifications/audit.service.js";

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
 * Task SRU-09: GET /api/orders/:id/activity
 *
 * Retrieves chronological audit activity timeline for an order.
 */
export const getOrderActivity = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { page, limit, sortOrder } = req.query;

  const order = await Order.findById(id).lean();
  if (!order) {
    throw new ApiError(404, `Order ${id} not found.`);
  }

  verifyOrderAuthorization(order, req.user);

  const timeline = await getOrderActivityTimeline(order._id, {
    page,
    limit,
    sortOrder,
  });

  return res.status(200).json(
    new APIResponse(
      200,
      timeline,
      "Order activity timeline retrieved successfully."
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

/**
 * Task SRU-05: PATCH /api/orders/:id/supplier-status
 * Wholesaler or Admin confirms, rejects, or updates delivery status.
 */
export const patchSupplierStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updatePayload = req.body;

  const updatedOrder = await updateSupplierStatus(id, updatePayload, req.user);

  return res.status(200).json(
    new APIResponse(
      200,
      updatedOrder,
      "Order supplier status updated successfully."
    )
  );
});

/**
 * Task SRU-05: POST /api/orders/from-pool/:poolId
 * Manually or programmatically finalize order from a funded pool.
 */
export const createOrderFromPool = asyncHandler(async (req, res) => {
  const { poolId } = req.params;

  const order = await createFinalOrderFromFundedPool(poolId);

  return res.status(201).json(
    new APIResponse(
      201,
      order,
      "Final bulk order created successfully from funded pool."
    )
  );
});
