import { selectPriceTier } from "../pricing/pricingEngine.service.js";
import { ApiError } from "../../utils/apiError.js";

/**
 * Task SAH-07: Deterministic Landed-Cost Offer Comparison Service
 *
 * Implements authoritative mathematical comparison between candidate wholesale offers:
 * 1. Integer Minor Units (paise/cents): Zero floating-point arithmetic errors.
 * 2. Tier Selection: Resolves applicable unit price tier for the requested quantity.
 * 3. Landed Cost Calculation: Merchandise cost + known shipping fees.
 * 4. Two-Level MOQ Feasibility: Wholesaler MOQ_W, Retailer floor MOQ_R (20%), Step (1%).
 * 5. Cost Flags: Explicit warnings for GST_EXCLUDED, SHIPPING_PENDING, etc.
 * 6. Quote Freshness: Expiration timestamps and days remaining.
 */

/**
 * Calculates deterministic landed-cost metrics for a list of supplier offers against a requirement.
 *
 * @param {object} requirement - The confirmed purchasing requirement
 * @param {Array<object>} offers - Candidate SupplierOffer records
 * @returns {object} Calculated comparisons and ranking
 */
export function compareOffersDeterministically(requirement, offers = []) {
  if (!requirement || typeof requirement !== "object") {
    throw new ApiError(400, "Invalid requirement: must be a valid requirement object.");
  }

  if (!Array.isArray(offers)) {
    throw new ApiError(400, "Invalid offers: must be an array of supplier offer records.");
  }

  const reqFields = requirement.confirmedFields || requirement;
  const rawQuantity =
    reqFields.requestedQuantity !== undefined
      ? reqFields.requestedQuantity
      : requirement.requestedQuantity !== undefined
      ? requirement.requestedQuantity
      : 1;

  const requestedQuantity = Number(rawQuantity);

  if (isNaN(requestedQuantity) || requestedQuantity <= 0 || !Number.isInteger(requestedQuantity)) {
    throw new ApiError(400, "Requested quantity must be a positive integer.");
  }

  const currency = requirement.currency || offers[0]?.currency || "INR";
  const now = new Date();

  const evaluatedComparisons = [];

  for (const offer of offers) {
    const offerId = (offer._id || offer.id || String(offer)).toString();
    const supplier = offer.supplierId && typeof offer.supplierId === "object" ? offer.supplierId : {};
    const product = offer.productId && typeof offer.productId === "object" ? offer.productId : {};

    // 1. Resolve Unit Price Tier using deterministic pricing engine
    const baseUnitPriceMinor = Number(offer.baseUnitPriceMinor || 1);
    const { appliedUnitPriceMinor, matchedTier } = selectPriceTier(
      requestedQuantity,
      offer.quantityTiers || [],
      baseUnitPriceMinor
    );

    // 2. Merchandise Total in Integer Minor Units (Paise)
    const merchandiseTotalMinor = Math.round(requestedQuantity * appliedUnitPriceMinor);

    // 3. Shipping and Landed Cost Calculation
    const isShippingKnown = offer.flatShippingCostMinor != null;
    const shippingCostMinor = isShippingKnown ? Number(offer.flatShippingCostMinor) : null;
    const knownLandedCostMinor = merchandiseTotalMinor + (shippingCostMinor || 0);

    // 4. Two-Level MOQ & Step Feasibility Math
    const wholesaleMoq = Number(offer.minimumOrderQuantity || 1);
    const retailerMoqPercentage = Number(offer.retailerMoqPercentage || 20);
    const retailerStepPercentage = Number(offer.retailerStepPercentage || 1);

    const retailerMoq =
      offer.minRetailerQuantityOverride != null
        ? Number(offer.minRetailerQuantityOverride)
        : Math.ceil((wholesaleMoq * retailerMoqPercentage) / 100);

    const retailerStep =
      offer.quantityStepMultipleOverride != null
        ? Number(offer.quantityStepMultipleOverride)
        : Math.max(1, Math.round((wholesaleMoq * retailerStepPercentage) / 100));

    const meetsRetailerMoq = requestedQuantity >= retailerMoq;
    const meetsWholesaleMoq = requestedQuantity >= wholesaleMoq;
    const stepCompliant = requestedQuantity % retailerStep === 0;
    const shortfallToWholesaleMoq = Math.max(0, wholesaleMoq - requestedQuantity);

    // 5. Unknown / Excluded Cost Flags
    const costFlags = [];
    const taxInclusion = offer.taxInclusion || "GST_EXCLUDED";

    if (taxInclusion === "GST_EXCLUDED") {
      costFlags.push("GST_EXCLUDED");
    } else if (taxInclusion === "TAX_PENDING") {
      costFlags.push("TAX_PENDING");
    } else if (taxInclusion === "GST_INCLUDED") {
      costFlags.push("GST_INCLUDED");
    }

    if (!isShippingKnown) {
      costFlags.push("SHIPPING_PENDING");
    } else {
      costFlags.push("FLAT_SHIPPING_CONFIRMED");
    }

    // 6. Quote Freshness
    const expiresAt = offer.expiresAt ? new Date(offer.expiresAt) : null;
    const isExpired = expiresAt ? expiresAt <= now : false;
    const daysUntilExpiry = expiresAt
      ? Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : 0;

    evaluatedComparisons.push({
      offerId,
      supplierId: (supplier._id || offer.supplierId || "").toString(),
      supplierName: supplier.name || "Wholesale Supplier",
      productId: (product._id || offer.productId || "").toString(),
      productName: product.canonicalName || offer.supplierProductDescription || "Product",
      packUnit: offer.packUnit || "UNIT",
      packSize: offer.packSize || "1 unit",
      currency: offer.currency || currency,
      requestedQuantity,
      appliedUnitPriceMinor,
      merchandiseTotalMinor,
      shippingCostMinor,
      isShippingKnown,
      knownLandedCostMinor,
      matchedTierMinQuantity: matchedTier ? matchedTier.minQuantity : null,
      moqFeasibility: {
        wholesaleMoq,
        retailerMoq,
        retailerStep,
        meetsRetailerMoq,
        meetsWholesaleMoq,
        stepCompliant,
        shortfallToWholesaleMoq,
      },
      costFlags,
      leadTimeDays: offer.leadTimeDays || 3,
      shippingTerms: offer.shippingTerms || "EX_WORKS",
      quoteFreshness: {
        quoteTimestamp: offer.quoteTimestamp || offer.createdAt || null,
        expiresAt,
        isExpired,
        daysUntilExpiry,
      },
      dataSourceType: offer.dataSourceType || "SEEDED_DEMO",
      verificationStatus: offer.verificationStatus || "DEMO_SAMPLE",
    });
  }

  // 7. Sort by known landed cost ascending (best value first)
  evaluatedComparisons.sort((a, b) => a.knownLandedCostMinor - b.knownLandedCostMinor);

  // 8. Identify highest cost to calculate relative savings
  const maxLandedCost =
    evaluatedComparisons.length > 0
      ? Math.max(...evaluatedComparisons.map((c) => c.knownLandedCostMinor))
      : 0;

  for (const comparison of evaluatedComparisons) {
    comparison.savingsVsHighestMinor = Math.max(0, maxLandedCost - comparison.knownLandedCostMinor);
  }

  const bestOfferId =
    evaluatedComparisons.length > 0 ? evaluatedComparisons[0].offerId : null;

  return {
    requestedQuantity,
    currency,
    totalOffersCompared: evaluatedComparisons.length,
    bestOfferId,
    comparisons: evaluatedComparisons,
  };
}

export default {
  compareOffersDeterministically,
};

