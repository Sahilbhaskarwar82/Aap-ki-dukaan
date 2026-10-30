import fs from "node:fs/promises";
import mongoose from "mongoose";
import { Requirement } from "../models/Requirement.model.js";
import { UploadedDocument } from "../models/UploadedDocument.model.js";
import { parseRequirementCsv } from "../utils/csvParser.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { APIResponse } from "../utils/apiResponse.js";
import { ApiError } from "../utils/apiError.js";

/**
 * Task SAH-02: Requirement Controller
 *
 * Implements purchasing requirement intake, CRUD operations, bulk CSV import,
 * and strict enforcement of Business Rule BR-001 upon confirmation.
 */

/**
 * Helper to validate Business Rule BR-001:
 * Confirmed requirement MUST have:
 * 1. productName (non-empty string)
 * 2. category (non-empty string)
 * 3. requestedQuantity (positive integer >= 1)
 * 4. quantityUnit (non-empty string)
 * 5. deliveryArea (non-empty string)
 *
 * @param {object} fields - The confirmedFields object
 */
export function validateRuleBR001(fields) {
  const missing = [];

  if (!fields.productName || typeof fields.productName !== "string" || !fields.productName.trim()) {
    missing.push("productName");
  }

  if (!fields.category || typeof fields.category !== "string" || !fields.category.trim()) {
    missing.push("category");
  }

  const qty = fields.requestedQuantity;
  if (qty == null || typeof qty !== "number" || !Number.isInteger(qty) || qty <= 0) {
    missing.push("requestedQuantity (must be a positive integer >= 1)");
  }

  if (!fields.quantityUnit || typeof fields.quantityUnit !== "string" || !fields.quantityUnit.trim()) {
    missing.push("quantityUnit");
  }

  if (!fields.deliveryArea || typeof fields.deliveryArea !== "string" || !fields.deliveryArea.trim()) {
    missing.push("deliveryArea");
  }

  if (missing.length > 0) {
    throw new ApiError(
      400,
      `BR-001 Validation Failed: Cannot confirm requirement. The following mandatory fields are missing or invalid in confirmedFields: ${missing.join(", ")}.`
    );
  }
}

/**
 * Task SAH-02: POST /api/requirements
 * Creates a new purchasing requirement in DRAFT status.
 */
export const createRequirement = asyncHandler(async (req, res) => {
  const {
    originalDescription,
    sourceType = "FORM",
    uploadedDocumentId,
    extractedFields = {},
    confirmedFields = {},
    status = "DRAFT",
  } = req.body;

  const shopId =
    req.user?.shopId ||
    req.shop?._id ||
    req.body.shopId ||
    new mongoose.Types.ObjectId("000000000000000000000002");

  const createdByUserId =
    req.user?._id ||
    req.body.createdByUserId ||
    new mongoose.Types.ObjectId("000000000000000000000001");

  const requirement = await Requirement.create({
    shopId,
    createdByUserId,
    sourceType,
    originalDescription: originalDescription || "",
    uploadedDocumentId: uploadedDocumentId || null,
    extractedFields,
    confirmedFields,
    status: status || "DRAFT",
  });

  return res.status(201).json(
    new APIResponse(201, requirement, "Requirement draft created successfully.")
  );
});

/**
 * Task SAH-02: GET /api/requirements
 * Lists requirements with filtering by shopId, status, category, deliveryArea, and pagination.
 */
export const listRequirements = asyncHandler(async (req, res) => {
  const {
    shopId,
    status,
    category,
    deliveryArea,
    page = 1,
    limit = 20,
  } = req.query;

  const filter = {};

  // Scope to authenticated user's shop if retailer
  if (req.user?.shopId) {
    filter.shopId = req.user.shopId;
  } else if (shopId && mongoose.Types.ObjectId.isValid(shopId)) {
    filter.shopId = new mongoose.Types.ObjectId(shopId);
  }

  if (status) {
    filter.status = status.toUpperCase().trim();
  }

  if (category) {
    filter.category = category.toUpperCase().trim();
  }

  if (deliveryArea) {
    filter.deliveryArea = deliveryArea.toUpperCase().trim();
  }

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const skip = (pageNum - 1) * limitNum;

  const [requirements, totalCount] = await Promise.all([
    Requirement.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Requirement.countDocuments(filter),
  ]);

  return res.status(200).json(
    new APIResponse(
      200,
      {
        requirements,
        pagination: {
          totalCount,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(totalCount / limitNum),
        },
      },
      "Requirements retrieved successfully."
    )
  );
});

/**
 * Task SAH-02: GET /api/requirements/:id
 * Retrieves requirement details by ID with ownership guard.
 */
export const getRequirementById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid requirement ID format.");
  }

  const requirement = await Requirement.findById(id)
    .populate("uploadedDocumentId", "originalFilename mimeType sizeBytes status")
    .lean();

  if (!requirement) {
    throw new ApiError(404, "Purchasing requirement not found.");
  }

  // Ownership guard
  if (req.user && req.user.role === "SHOP_OWNER" && req.user.shopId) {
    if (!requirement.shopId.equals(req.user.shopId)) {
      throw new ApiError(403, "Access denied: You do not have permission to view this requirement.");
    }
  }

  return res.status(200).json(
    new APIResponse(200, requirement, "Requirement retrieved successfully.")
  );
});

/**
 * Task SAH-02: PATCH /api/requirements/:id
 * Updates requirement fields, saves edits, and enforces Business Rule BR-001 on CONFIRMED status transition.
 */
export const updateRequirement = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid requirement ID format.");
  }

  const requirement = await Requirement.findById(id);
  if (!requirement) {
    throw new ApiError(404, "Purchasing requirement not found.");
  }

  // Ownership guard: Retailers can only edit their own shop's requirements
  if (req.user && req.user.role === "SHOP_OWNER" && req.user.shopId) {
    if (!requirement.shopId.equals(req.user.shopId)) {
      throw new ApiError(403, "Access denied: You cannot edit another shop's requirement.");
    }
  }

  const {
    status,
    confirmedFields,
    extractedFields,
    originalDescription,
    extractionNotes,
  } = req.body;

  // 1. Update unconfirmed / extracted fields if provided
  if (extractedFields && typeof extractedFields === "object") {
    requirement.extractedFields = {
      ...requirement.extractedFields?.toObject?.(),
      ...extractedFields,
    };
  }

  if (originalDescription !== undefined) {
    requirement.originalDescription = originalDescription;
  }

  if (extractionNotes !== undefined) {
    requirement.extractionNotes = extractionNotes;
  }

  // 2. Merge confirmed fields
  let mergedConfirmed = {
    ...requirement.confirmedFields?.toObject?.(),
    ...(confirmedFields || {}),
  };

  // 3. CRITICAL Business Rule BR-001: Validate before transitioning to CONFIRMED
  if (status === "CONFIRMED") {
    validateRuleBR001(mergedConfirmed);

    // Sync authoritative confirmed fields to top-level flattened indexed properties
    requirement.confirmedFields = mergedConfirmed;
    requirement.productName = mergedConfirmed.productName.trim();
    requirement.category = mergedConfirmed.category.trim().toUpperCase();
    requirement.requestedQuantity = mergedConfirmed.requestedQuantity;
    requirement.quantityUnit = mergedConfirmed.quantityUnit.trim().toUpperCase();
    requirement.deliveryArea = mergedConfirmed.deliveryArea.trim().toUpperCase();
    requirement.packSize = mergedConfirmed.packSize?.trim() || null;
    requirement.requiredBy = mergedConfirmed.requiredBy ? new Date(mergedConfirmed.requiredBy) : null;

    requirement.status = "CONFIRMED";
    requirement.confirmedByUserId =
      req.user?._id || req.body.confirmedByUserId || requirement.createdByUserId;
    requirement.confirmedAt = new Date();
  } else {
    // If not confirming, simply update confirmedFields and new status if provided
    if (confirmedFields && typeof confirmedFields === "object") {
      requirement.confirmedFields = mergedConfirmed;
    }

    if (status) {
      requirement.status = status;
    }
  }

  await requirement.save();

  return res.status(200).json(
    new APIResponse(200, requirement, `Requirement updated successfully (status: ${requirement.status}).`)
  );
});

/**
 * Task SAH-02: POST /api/requirements/import-csv
 * Bulk imports requirements from a CSV file or raw CSV payload and inserts as DRAFTs.
 */
export const importCsvRequirements = asyncHandler(async (req, res) => {
  let csvText = "";

  if (req.file) {
    try {
      csvText = await fs.readFile(req.file.path, "utf8");
    } finally {
      // Clean up uploaded temporary CSV file
      await fs.unlink(req.file.path).catch(() => {});
    }
  } else if (req.body.csv || req.body.csvData) {
    csvText = req.body.csv || req.body.csvData;
  } else {
    throw new ApiError(
      400,
      "No CSV data provided. Please upload a CSV file or provide a 'csv' string in the body."
    );
  }

  const parsedRecords = parseRequirementCsv(csvText);

  if (!parsedRecords || parsedRecords.length === 0) {
    throw new ApiError(
      400,
      "CSV parsing failed: No valid data rows found. Ensure CSV contains headers such as 'productName, category, quantity, unit, deliveryArea'."
    );
  }

  const shopId =
    req.user?.shopId ||
    req.shop?._id ||
    req.body.shopId ||
    new mongoose.Types.ObjectId("000000000000000000000002");

  const createdByUserId =
    req.user?._id ||
    req.body.createdByUserId ||
    new mongoose.Types.ObjectId("000000000000000000000001");

  const documentsToInsert = parsedRecords.map((row) => ({
    shopId,
    createdByUserId,
    sourceType: "CSV",
    originalDescription:
      row.originalDescription || `Bulk CSV import: ${row.productName || "Product"}`,
    extractedFields: {},
    confirmedFields: {
      productName: row.productName || null,
      category: row.category ? row.category.toUpperCase() : null,
      requestedQuantity: row.requestedQuantity || null,
      quantityUnit: row.quantityUnit ? row.quantityUnit.toUpperCase() : null,
      deliveryArea: row.deliveryArea ? row.deliveryArea.toUpperCase() : null,
      packSize: row.packSize || null,
      material: row.material || null,
      capacityOrSize: row.capacityOrSize || null,
      requiredBy: row.requiredBy || null,
    },
    status: "DRAFT",
  }));

  const inserted = await Requirement.insertMany(documentsToInsert, { ordered: false });

  return res.status(201).json(
    new APIResponse(
      201,
      {
        totalImported: inserted.length,
        requirements: inserted,
      },
      `Successfully imported ${inserted.length} requirements as drafts.`
    )
  );
});

