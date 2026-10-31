import mongoose from "mongoose";
import { Quote } from "../models/Quote.model.js";
import { Supplier } from "../models/Supplier.model.js";
import { Product } from "../models/Product.model.js";
import { GroupBuyPool } from "../models/GroupBuyPool.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { APIResponse } from "../utils/apiResponse.js";
import { ApiError } from "../utils/apiError.js";

/**
 * Task SAH-09: Quote Controller
 *
 * Implements custom & revised supplier quote request and response workflow:
 * - Shop owners & admins can request quotes (POST /api/quotes/requests)
 * - Suppliers & admins can respond with binding pricing & terms (PATCH /api/quotes/:id/respond)
 * - Buyers & suppliers can list and inspect quotes with strict role-based scoping (GET /api/quotes)
 */

/**
 * Helper to resolve the Supplier profile associated with a user.
 */
async function getSupplierForUser(user) {
  if (!user) return null;
  return Supplier.findOne({ ownerUserId: user._id }).lean();
}

/**
 * POST /api/quotes/requests
 * Creates a new custom or revised quote request from a shop owner or admin.
 */
export const requestQuote = asyncHandler(async (req, res) => {
  const {
    supplierId,
    productId,
    supplierOfferId,
    poolId,
    requirementId,
    requestedQuantity,
    deliveryArea,
    targetDeliveryDate,
    requestReason = "NO_COMPATIBLE_OFFER",
    requestNotes = "",
    currency = "INR",
  } = req.body || {};

  // 1. Validate required fields
  if (!supplierId || !mongoose.Types.ObjectId.isValid(supplierId)) {
    throw new ApiError(400, "Valid supplierId is required.");
  }

  if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
    throw new ApiError(400, "Valid productId is required.");
  }

  const qty = Number(requestedQuantity);
  if (isNaN(qty) || qty <= 0 || !Number.isInteger(qty)) {
    throw new ApiError(400, "Requested quantity must be a positive integer.");
  }

  if (!deliveryArea || typeof deliveryArea !== "string" || !deliveryArea.trim()) {
    throw new ApiError(400, "Delivery area is required.");
  }

  // 2. Verify existence of Supplier and Product
  const [supplier, product] = await Promise.all([
    Supplier.findById(supplierId).lean(),
    Product.findById(productId).lean(),
  ]);

  if (!supplier) {
    throw new ApiError(404, "Supplier record not found.");
  }

  if (!product) {
    throw new ApiError(404, "Product record not found.");
  }

  // 3. Optional Pool association & state verification
  let pool = null;
  if (poolId) {
    if (!mongoose.Types.ObjectId.isValid(poolId)) {
      throw new ApiError(400, "Invalid poolId format.");
    }
    pool = await GroupBuyPool.findById(poolId);
    if (!pool) {
      throw new ApiError(404, "Referenced GroupBuyPool not found.");
    }
  }

  // 4. Determine requester identity & shop context
  const requestingUserId = req.user ? req.user._id : req.body.requestedByUserId;
  if (!requestingUserId || !mongoose.Types.ObjectId.isValid(requestingUserId)) {
    throw new ApiError(401, "Authenticated user or valid requestedByUserId is required.");
  }

  const shopId = req.shop?._id || req.body.shopId || null;

  // 5. Create Quote document
  const quoteDoc = await Quote.create({
    supplierId,
    productId,
    supplierOfferId: supplierOfferId && mongoose.Types.ObjectId.isValid(supplierOfferId) ? supplierOfferId : null,
    poolId: pool ? pool._id : null,
    requirementId: requirementId && mongoose.Types.ObjectId.isValid(requirementId) ? requirementId : null,
    requestedByUserId: requestingUserId,
    shopId,
    requestedQuantity: qty,
    deliveryArea: deliveryArea.toUpperCase().trim(),
    targetDeliveryDate: targetDeliveryDate ? new Date(targetDeliveryDate) : null,
    requestReason,
    requestNotes: String(requestNotes || "").trim(),
    currency,
    status: "REQUESTED",
    source: poolId ? "UNDER_MOQ_AUTO_TRIGGER" : "BUYER_REQUEST",
  });

  // 6. If linked to an under-MOQ pool, update pool supplier status to AWAITING_SUPPLIER
  if (pool) {
    pool.supplierUnderMoqStatus = "AWAITING_SUPPLIER";
    await pool.save();
  }

  return res.status(201).json(
    new APIResponse(201, quoteDoc, "Quote request created successfully.")
  );
});

/**
 * GET /api/quotes
 * Retrieves quotes with strict role-based data isolation and filtering.
 */
export const listQuotes = asyncHandler(async (req, res) => {
  const {
    status,
    poolId,
    productId,
    supplierId,
    page = 1,
    limit = 20,
  } = req.query;

  const filter = {};

  // 1. Role-based scoping
  const user = req.user;
  if (user) {
    if (user.role === "SHOP_OWNER") {
      filter.requestedByUserId = user._id;
    } else if (user.role === "SUPPLIER") {
      const supplier = await getSupplierForUser(user);
      if (supplier) {
        filter.supplierId = supplier._id;
      } else {
        // Supplier user has not configured a supplier company yet
        filter.supplierId = new mongoose.Types.ObjectId(); // match nothing
      }
    }
  }

  // 2. Apply query filters
  if (status) {
    filter.status = status.toUpperCase().trim();
  }

  if (poolId && mongoose.Types.ObjectId.isValid(poolId)) {
    filter.poolId = new mongoose.Types.ObjectId(poolId);
  }

  if (productId && mongoose.Types.ObjectId.isValid(productId)) {
    filter.productId = new mongoose.Types.ObjectId(productId);
  }

  if (supplierId && mongoose.Types.ObjectId.isValid(supplierId) && (!user || user.role === "ADMIN")) {
    filter.supplierId = new mongoose.Types.ObjectId(supplierId);
  }

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const skip = (pageNum - 1) * limitNum;

  const [quotes, totalCount] = await Promise.all([
    Quote.find(filter)
      .populate("supplierId", "name contactReference serviceAreas verificationStatus")
      .populate("productId", "canonicalName category baseUnit packSizeDescription specifications")
      .populate("requestedByUserId", "name email role")
      .populate("poolId", "title targetMoq totalEligibleQuantity state")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    Quote.countDocuments(filter),
  ]);

  // 3. Mark expired quotes lazily if validUntil has passed
  const now = new Date();
  for (const quote of quotes) {
    if (quote.status === "PROVIDED" && quote.validUntil && quote.validUntil <= now) {
      quote.status = "EXPIRED";
      await Quote.updateOne({ _id: quote._id, status: "PROVIDED" }, { status: "EXPIRED" });
    }
  }

  return res.status(200).json(
    new APIResponse(
      200,
      {
        quotes,
        pagination: {
          totalCount,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(totalCount / limitNum),
        },
      },
      "Quotes retrieved successfully."
    )
  );
});

/**
 * GET /api/quotes/:id
 * Retrieves an individual quote with ownership verification.
 */
export const getQuoteById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid quote ID format.");
  }

  const quote = await Quote.findById(id)
    .populate("supplierId", "name contactReference serviceAreas verificationStatus ownerUserId")
    .populate("productId", "canonicalName category baseUnit packSizeDescription specifications")
    .populate("requestedByUserId", "name email role")
    .populate("poolId", "title targetMoq totalEligibleQuantity state");

  if (!quote) {
    throw new ApiError(404, "Quote record not found.");
  }

  // Ownership Guard
  const user = req.user;
  if (user && user.role !== "ADMIN" && user.role !== "REVIEWER") {
    if (user.role === "SHOP_OWNER") {
      const isOwner = quote.requestedByUserId && quote.requestedByUserId._id.toString() === user._id.toString();
      if (!isOwner) {
        throw new ApiError(403, "Access denied: you do not have permission to view this quote.");
      }
    } else if (user.role === "SUPPLIER") {
      const supplierOwnerId = quote.supplierId?.ownerUserId?.toString();
      const userSupplier = await getSupplierForUser(user);
      const isSupplierTarget =
        supplierOwnerId === user._id.toString() ||
        (userSupplier && userSupplier._id.toString() === quote.supplierId?._id?.toString());

      if (!isSupplierTarget) {
        throw new ApiError(403, "Access denied: this quote is not assigned to your supplier company.");
      }
    }
  }

  // Automatic freshness evaluation
  if (quote.status === "PROVIDED" && quote.validUntil && quote.validUntil <= new Date()) {
    quote.status = "EXPIRED";
    await Quote.updateOne({ _id: quote._id, status: "PROVIDED" }, { status: "EXPIRED" });
  }

  return res.status(200).json(
    new APIResponse(200, quote, "Quote details retrieved successfully.")
  );
});

/**
 * PATCH /api/quotes/:id/respond
 * Supplier or Admin submits pricing, validity date, shipping terms, and sub-MOQ conditions.
 */
export const respondToQuote = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    action = "PROVIDE",
    unitPriceMinor,
    shippingCostMinor,
    shippingTerms,
    taxInclusion,
    leadTimeDays,
    validUntil,
    quantityTiers,
    subMoqTerms = {},
    rejectionReason = "",
  } = req.body || {};

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid quote ID format.");
  }

  const quote = await Quote.findById(id).populate("supplierId");
  if (!quote) {
    throw new ApiError(404, "Quote record not found.");
  }

  // 1. Check current quote status
  if (["ACCEPTED", "REJECTED"].includes(quote.status)) {
    throw new ApiError(400, `Cannot respond to a quote that is already ${quote.status}.`);
  }

  // 2. Ownership verification for SUPPLIER role
  const user = req.user;
  if (user && user.role !== "ADMIN") {
    if (user.role !== "SUPPLIER") {
      throw new ApiError(403, "Only suppliers or platform administrators can respond to quotes.");
    }

    const supplierOwnerId = quote.supplierId?.ownerUserId?.toString();
    const userSupplier = await getSupplierForUser(user);
    const matchesSupplier =
      supplierOwnerId === user._id.toString() ||
      (userSupplier && userSupplier._id.toString() === quote.supplierId?._id?.toString());

    if (!matchesSupplier) {
      throw new ApiError(403, "Access denied: you can only respond to quotes directed to your supplier company.");
    }
  }

  // 3. Handle Rejection Action
  if (action === "REJECT") {
    quote.status = "REJECTED";
    quote.respondedAt = new Date();
    quote.respondedByUserId = user ? user._id : null;
    quote.subMoqTerms = {
      ...quote.subMoqTerms,
      supplierNotes: rejectionReason || "Supplier unable to fulfill requested terms.",
    };

    await quote.save();

    // If linked to pool, mark pool sub-MOQ status as REJECTED_SUB_MOQ
    if (quote.poolId) {
      await GroupBuyPool.findByIdAndUpdate(quote.poolId, {
        supplierUnderMoqStatus: "REJECTED_SUB_MOQ",
      });
    }

    return res.status(200).json(
      new APIResponse(200, quote, "Quote has been rejected.")
    );
  }

  // 4. Handle Provide Quote Action: Strict Validation
  const unitPrice = Number(unitPriceMinor);
  if (isNaN(unitPrice) || unitPrice <= 0 || !Number.isInteger(unitPrice)) {
    throw new ApiError(400, "unitPriceMinor must be a positive integer in minor units (paise).");
  }

  if (!validUntil) {
    throw new ApiError(400, "validUntil date timestamp is required.");
  }

  const validUntilDate = new Date(validUntil);
  if (isNaN(validUntilDate.getTime()) || validUntilDate <= new Date()) {
    throw new ApiError(400, "validUntil must be a valid future date.");
  }

  if (shippingCostMinor !== undefined && shippingCostMinor !== null) {
    const shipping = Number(shippingCostMinor);
    if (isNaN(shipping) || shipping < 0 || !Number.isInteger(shipping)) {
      throw new ApiError(400, "shippingCostMinor must be a non-negative integer.");
    }
    quote.shippingCostMinor = shipping;
  }

  if (leadTimeDays !== undefined && leadTimeDays !== null) {
    const leadTime = Number(leadTimeDays);
    if (isNaN(leadTime) || leadTime < 1) {
      throw new ApiError(400, "leadTimeDays must be at least 1 day.");
    }
    quote.leadTimeDays = leadTime;
  }

  if (shippingTerms) {
    quote.shippingTerms = shippingTerms;
  }

  if (taxInclusion) {
    quote.taxInclusion = taxInclusion;
  }

  if (Array.isArray(quantityTiers)) {
    quote.quantityTiers = quantityTiers;
  }

  if (typeof subMoqTerms === "object" && subMoqTerms !== null) {
    quote.subMoqTerms = {
      acceptsSubMoq: Boolean(subMoqTerms.acceptsSubMoq),
      minSubMoqQuantity: subMoqTerms.minSubMoqQuantity ? Number(subMoqTerms.minSubMoqQuantity) : null,
      surchargeMinor: subMoqTerms.surchargeMinor ? Number(subMoqTerms.surchargeMinor) : 0,
      supplierNotes: String(subMoqTerms.supplierNotes || "").trim(),
    };
  }

  // 5. Update quote pricing and transition status to PROVIDED
  quote.unitPriceMinor = unitPrice;
  quote.validUntil = validUntilDate;
  quote.status = "PROVIDED";
  quote.respondedAt = new Date();
  quote.respondedByUserId = user ? user._id : null;

  await quote.save();

  // 6. If linked to an under-MOQ pool, sync revised quote with pool
  if (quote.poolId) {
    await GroupBuyPool.findByIdAndUpdate(quote.poolId, {
      activeQuoteId: quote._id,
      supplierUnderMoqStatus: "REVISED_QUOTE_PROVIDED",
      baseUnitPriceMinor: quote.unitPriceMinor,
      currentUnitPriceMinor: quote.unitPriceMinor,
      shippingCostMinor: quote.shippingCostMinor != null ? quote.shippingCostMinor : undefined,
    });
  }

  return res.status(200).json(
    new APIResponse(200, quote, "Supplier quote provided successfully.")
  );
});

export default {
  requestQuote,
  listQuotes,
  getQuoteById,
  respondToQuote,
};
