import mongoose from "mongoose";
import { Supplier } from "../models/Supplier.model.js";
import { Product } from "../models/Product.model.js";
import { SupplierOffer } from "../models/SupplierOffer.model.js";
import { Requirement } from "../models/Requirement.model.js";
import { compareOffersDeterministically } from "../services/supplierSearch/catalogue.service.js";
import { summarizeQuotes } from "../services/ai/advisory.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { APIResponse } from "../utils/apiResponse.js";
import { ApiError } from "../utils/apiError.js";

/**
 * Task SAH-05: GET /api/suppliers
 *
 * Retrieves suppliers with filtering by serviceArea, verificationStatus,
 * activeStatus, dataSourceType, and full/partial name search.
 */
export const listSuppliers = asyncHandler(async (req, res) => {
  const {
    serviceArea,
    verificationStatus,
    activeStatus = "ACTIVE",
    dataSourceType,
    search,
    page = 1,
    limit = 20,
  } = req.query;

  const filter = {};

  if (activeStatus && activeStatus !== "ALL") {
    filter.activeStatus = activeStatus.toUpperCase();
  }

  if (verificationStatus) {
    filter.verificationStatus = verificationStatus.toUpperCase();
  }

  if (dataSourceType) {
    filter.dataSourceType = dataSourceType.toUpperCase();
  }

  if (serviceArea) {
    filter.serviceAreas = { $in: [serviceArea.toUpperCase(), "ALL_INDIA"] };
  }

  if (search) {
    filter.name = { $regex: search.trim(), $options: "i" };
  }

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const skip = (pageNum - 1) * limitNum;

  const [suppliers, totalCount] = await Promise.all([
    Supplier.find(filter).sort({ name: 1 }).skip(skip).limit(limitNum).lean(),
    Supplier.countDocuments(filter),
  ]);

  return res.status(200).json(
    new APIResponse(
      200,
      {
        suppliers,
        pagination: {
          totalCount,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(totalCount / limitNum),
        },
      },
      "Suppliers retrieved successfully."
    )
  );
});

/**
 * Task SAH-05: GET /api/suppliers/:id
 *
 * Retrieves a single supplier by unique ID.
 */
export const getSupplierById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid supplier ID format.");
  }

  const supplier = await Supplier.findById(id).lean();
  if (!supplier) {
    throw new ApiError(404, "Supplier record not found.");
  }

  return res.status(200).json(
    new APIResponse(200, supplier, "Supplier retrieved successfully.")
  );
});

/**
 * Task SAH-05: GET /api/products/search
 *
 * Full-text and facet search over the master Product catalogue.
 */
export const searchProducts = asyncHandler(async (req, res) => {
  const { q, category, material, foodSafe, page = 1, limit = 20 } = req.query;

  const filter = { isActive: true };

  if (category) {
    filter.category = category.toUpperCase().trim();
  }

  if (material) {
    filter["specifications.material"] = { $regex: material.trim(), $options: "i" };
  }

  if (foodSafe !== undefined) {
    filter["specifications.foodSafe"] = foodSafe === "true" || foodSafe === true;
  }

  if (q && q.trim()) {
    const query = q.trim();
    filter.$or = [
      { canonicalName: { $regex: query, $options: "i" } },
      { synonyms: { $regex: query, $options: "i" } },
    ];
  }

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const skip = (pageNum - 1) * limitNum;

  const [products, totalCount] = await Promise.all([
    Product.find(filter).sort({ canonicalName: 1 }).skip(skip).limit(limitNum).lean(),
    Product.countDocuments(filter),
  ]);

  return res.status(200).json(
    new APIResponse(
      200,
      {
        products,
        pagination: {
          totalCount,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(totalCount / limitNum),
        },
      },
      "Products matching search criteria retrieved successfully."
    )
  );
});

/**
 * Task SAH-05: GET /api/offers/search
 *
 * Searches active, fresh supplier offers by delivery area, category,
 * maximum wholesale MOQ, and provenance (dataSourceType).
 */
export const searchOffers = asyncHandler(async (req, res) => {
  const {
    productId,
    category,
    deliveryArea,
    maxMoq,
    dataSourceType,
    includeExpired = false,
    page = 1,
    limit = 20,
  } = req.query;

  const filter = { isActive: true };

  // Exclude expired quotes by default
  if (includeExpired !== "true" && includeExpired !== true) {
    filter.expiresAt = { $gt: new Date() };
  }

  if (productId && mongoose.Types.ObjectId.isValid(productId)) {
    filter.productId = new mongoose.Types.ObjectId(productId);
  }

  if (deliveryArea) {
    filter.deliveryAreas = { $in: [deliveryArea.toUpperCase().trim(), "ALL_INDIA"] };
  }

  if (maxMoq) {
    const parsedMoq = parseInt(maxMoq, 10);
    if (!isNaN(parsedMoq) && parsedMoq > 0) {
      filter.minimumOrderQuantity = { $lte: parsedMoq };
    }
  }

  if (dataSourceType) {
    filter.dataSourceType = dataSourceType.toUpperCase().trim();
  }

  // If category is requested, filter via matching Product IDs
  if (category) {
    const matchingProducts = await Product.find({
      category: category.toUpperCase().trim(),
      isActive: true,
    }).select("_id").lean();

    const productIds = matchingProducts.map((p) => p._id);
    filter.productId = filter.productId
      ? { $in: [filter.productId].filter((id) => productIds.some((pid) => pid.equals(id))) }
      : { $in: productIds };
  }

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const skip = (pageNum - 1) * limitNum;

  const [offers, totalCount] = await Promise.all([
    SupplierOffer.find(filter)
      .populate("supplierId", "name contactReference serviceAreas verificationStatus dataSourceType")
      .populate("productId", "canonicalName category baseUnit packSizeDescription specifications")
      .sort({ baseUnitPriceMinor: 1 })
      .skip(skip)
      .limit(limitNum),
    SupplierOffer.countDocuments(filter),
  ]);

  return res.status(200).json(
    new APIResponse(
      200,
      {
        offers,
        pagination: {
          totalCount,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(totalCount / limitNum),
        },
      },
      "Supplier offers matching search criteria retrieved successfully."
    )
  );
});

/**
 * Task SAH-07: POST /api/offers/compare
 *
 * Compares candidate supplier offers deterministically (integer minor units,
 * exact tier selection, shipping, Two-Level MOQ feasibility, cost flags),
 * and generates an AI trade-off summary strictly grounded in the backend figures.
 */
export const compareOffers = asyncHandler(async (req, res) => {
  const { requirement, requirementId, offerIds, requestedQuantity, deliveryArea } = req.body || {};

  let reqDoc = requirement;

  if (!reqDoc && requirementId) {
    if (!mongoose.Types.ObjectId.isValid(requirementId)) {
      throw new ApiError(400, "Invalid requirement ID format.");
    }
    reqDoc = await Requirement.findById(requirementId).lean();
    if (!reqDoc) {
      throw new ApiError(404, "Requirement record not found.");
    }
  }

  if (!reqDoc) {
    const qty = Number(requestedQuantity);
    if (!qty || isNaN(qty) || qty <= 0) {
      throw new ApiError(400, "Valid requirement, requirementId, or positive requestedQuantity is required.");
    }
    reqDoc = {
      confirmedFields: {
        requestedQuantity: qty,
        deliveryArea: deliveryArea || "DELHI_NCR",
      },
    };
  }

  let offers = [];

  if (Array.isArray(offerIds) && offerIds.length > 0) {
    const validIds = offerIds
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    offers = await SupplierOffer.find({ _id: { $in: validIds } })
      .populate("supplierId", "name contactReference serviceAreas verificationStatus")
      .populate("productId", "canonicalName category baseUnit packSizeDescription specifications")
      .lean();
  } else {
    const targetArea =
      reqDoc.confirmedFields?.deliveryArea ||
      reqDoc.deliveryArea ||
      reqDoc.extractedFields?.deliveryArea;

    const filter = { isActive: true, expiresAt: { $gt: new Date() } };

    if (targetArea) {
      filter.deliveryAreas = { $in: [targetArea.toUpperCase().trim(), "ALL_INDIA"] };
    }

    offers = await SupplierOffer.find(filter)
      .populate("supplierId", "name contactReference serviceAreas verificationStatus")
      .populate("productId", "canonicalName category baseUnit packSizeDescription specifications")
      .sort({ baseUnitPriceMinor: 1 })
      .limit(10)
      .lean();
  }

  // 1. Authoritative deterministic mathematical evaluation
  const comparison = compareOffersDeterministically(reqDoc, offers);

  // 2. AI Quote trade-off summarizer (zero-math hallucination)
  const summary = await summarizeQuotes(comparison);

  return res.status(200).json(
    new APIResponse(
      200,
      {
        comparison,
        summary,
      },
      "Supplier offers compared and summarized successfully."
    )
  );
});

