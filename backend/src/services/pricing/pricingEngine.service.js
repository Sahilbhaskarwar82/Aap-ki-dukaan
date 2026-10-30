import { ApiError } from "../../utils/apiError.js";

/**
 * Deterministic Pricing, Bulk Tier Selection & Shipping Allocation Engine (PRK-06)
 *
 * Single source of truth for:
 * 1. Bulk price tier resolution
 * 2. Integer minor unit (paise/cents) arithmetic
 * 3. Exact shipping cost allocation & paise remainder reconciliation
 * 4. Verified member savings calculation vs baseline price
 */

/**
 * Selects the best applicable price tier for a given aggregate quantity.
 * Tiers are sorted descending by minQuantity; the highest satisfied threshold wins.
 * If no tier threshold is reached, falls back to the base unit price.
 *
 * @param {number} aggregateQuantity - Total eligible quantity in pool
 * @param {Array<{ minQuantity: number, maxQuantity?: number, unitPriceMinor: number }>} tiers
 * @param {number} baseUnitPriceMinor
 * @returns {{ appliedUnitPriceMinor: number, matchedTier: Object|null }}
 */
export const selectPriceTier = (aggregateQuantity, tiers = [], baseUnitPriceMinor) => {
  if (!baseUnitPriceMinor || baseUnitPriceMinor <= 0) {
    throw new ApiError(400, "baseUnitPriceMinor must be a positive integer in minor units.");
  }

  if (!tiers || !Array.isArray(tiers) || tiers.length === 0) {
    return {
      appliedUnitPriceMinor: baseUnitPriceMinor,
      matchedTier: null,
    };
  }

  // Sort tiers by minQuantity descending
  const sortedTiers = [...tiers].sort((a, b) => b.minQuantity - a.minQuantity);

  for (const tier of sortedTiers) {
    const minQ = Number(tier.minQuantity);
    const maxQ = tier.maxQuantity !== null && tier.maxQuantity !== undefined ? Number(tier.maxQuantity) : Infinity;

    if (aggregateQuantity >= minQ && aggregateQuantity <= maxQ) {
      return {
        appliedUnitPriceMinor: Number(tier.unitPriceMinor),
        matchedTier: tier,
      };
    }
  }

  // No specific tier matched; use base price
  return {
    appliedUnitPriceMinor: baseUnitPriceMinor,
    matchedTier: null,
  };
};

/**
 * Allocates shipping cost across participants and reconciles remainder on the final participant share.
 *
 * @param {number} shippingCostMinor - Total shipping cost in minor units (or null/undefined)
 * @param {Array<{ quantity: number, weight?: number }>} contributions
 * @param {string} [method='PER_UNIT'] - 'PER_UNIT' | 'PER_WEIGHT' | 'EQUAL_SHARE'
 * @returns {{
 *   shippingStatus: 'KNOWN' | 'EXCLUDED_OR_PENDING',
 *   shippingCostMinor: number|null,
 *   shares: Array<{ shippingShareMinor: number, roundingAdjustmentMinor: number }>
 * }}
 */
export const allocateShipping = (shippingCostMinor, contributions, method = "PER_UNIT") => {
  if (shippingCostMinor === null || shippingCostMinor === undefined || isNaN(shippingCostMinor)) {
    return {
      shippingStatus: "EXCLUDED_OR_PENDING",
      shippingCostMinor: null,
      shares: contributions.map(() => ({
        shippingShareMinor: 0,
        roundingAdjustmentMinor: 0,
      })),
    };
  }

  const totalShipping = Math.round(Number(shippingCostMinor));
  const n = contributions.length;

  if (n === 0) {
    return {
      shippingStatus: "KNOWN",
      shippingCostMinor: totalShipping,
      shares: [],
    };
  }

  if (totalShipping === 0) {
    return {
      shippingStatus: "KNOWN",
      shippingCostMinor: 0,
      shares: contributions.map(() => ({
        shippingShareMinor: 0,
        roundingAdjustmentMinor: 0,
      })),
    };
  }

  let rawShares = [];

  if (method === "EQUAL_SHARE") {
    const baseShare = Math.floor(totalShipping / n);
    rawShares = contributions.map(() => baseShare);
  } else if (method === "PER_WEIGHT") {
    const totalWeight = contributions.reduce((acc, c) => acc + (c.weight || 1), 0);
    rawShares = contributions.map((c) => Math.floor((totalShipping * (c.weight || 1)) / totalWeight));
  } else {
    // Default: PER_UNIT
    const totalQty = contributions.reduce((acc, c) => acc + c.quantity, 0);
    if (totalQty === 0) {
      rawShares = contributions.map(() => 0);
    } else {
      rawShares = contributions.map((c) => Math.floor((totalShipping * c.quantity) / totalQty));
    }
  }

  // Calculate integer division remainder
  const sumRawShares = rawShares.reduce((acc, s) => acc + s, 0);
  const remainder = totalShipping - sumRawShares;

  // Reconcile remainder on the final participant share
  const shares = rawShares.map((share, idx) => {
    if (idx === n - 1) {
      return {
        shippingShareMinor: share + remainder,
        roundingAdjustmentMinor: remainder,
      };
    }
    return {
      shippingShareMinor: share,
      roundingAdjustmentMinor: 0,
    };
  });

  return {
    shippingStatus: "KNOWN",
    shippingCostMinor: totalShipping,
    shares,
  };
};

/**
 * Computes the authoritative deterministic price breakdown for a pool and its contributions.
 *
 * @param {Object} params
 * @param {Object} params.offer - SupplierOffer or Quote providing base price, tiers, shipping & tax terms
 * @param {Array<Object>} params.contributions - List of active member contributions
 * @param {string} [params.baselineSource='OFFER_BASE_TIER']
 * @returns {Object} Complete PriceSnapshot-compatible breakdown
 */
export const calculatePoolPricing = ({
  offer,
  contributions = [],
  baselineSource = "OFFER_BASE_TIER",
}) => {
  if (!offer) {
    throw new ApiError(400, "Offer specification is required for pricing calculation.");
  }

  const baseUnitPriceMinor = Number(offer.baseUnitPriceMinor || offer.unitPriceMinor);
  if (!baseUnitPriceMinor || baseUnitPriceMinor <= 0) {
    throw new ApiError(400, "Invalid base unit price on offer.");
  }

  // 1. Filter and sum active contribution quantities
  const totalEligibleQuantity = contributions.reduce((sum, c) => sum + Number(c.quantity || 0), 0);

  // 2. Select highest satisfied tier
  const { appliedUnitPriceMinor, matchedTier } = selectPriceTier(
    totalEligibleQuantity,
    offer.quantityTiers || [],
    baseUnitPriceMinor
  );

  // 3. Compute merchandise totals in integer minor units
  const merchandiseTotalMinor = totalEligibleQuantity * appliedUnitPriceMinor;

  // 4. Allocate shipping costs
  const shippingMethod = offer.shippingAllocationMethod || "PER_UNIT";
  const flatShippingCostMinor =
    offer.flatShippingCostMinor !== undefined ? offer.flatShippingCostMinor : null;

  const { shippingStatus, shippingCostMinor, shares: shippingShares } = allocateShipping(
    flatShippingCostMinor,
    contributions,
    shippingMethod
  );

  const groupTotalPayableMinor =
    merchandiseTotalMinor + (shippingStatus === "KNOWN" ? shippingCostMinor : 0);

  // 5. Build itemized member shares
  let verifiedSavingsTotalMinor = 0;

  const memberShares = contributions.map((c, idx) => {
    const qty = Number(c.quantity);
    const merchandiseShareMinor = qty * appliedUnitPriceMinor;
    const shippingShare = shippingShares[idx] || { shippingShareMinor: 0, roundingAdjustmentMinor: 0 };

    const totalPayableMinor = merchandiseShareMinor + shippingShare.shippingShareMinor;

    // Verified savings vs offer base unit price
    const unitSavings = Math.max(0, baseUnitPriceMinor - appliedUnitPriceMinor);
    const verifiedSavingsMinor = qty * unitSavings;
    verifiedSavingsTotalMinor += verifiedSavingsMinor;

    return {
      contributionId: c._id || c.contributionId,
      shopId: c.shopId,
      quantity: qty,
      unit: c.unit || offer.packUnit || "UNIT",
      appliedUnitPriceMinor,
      merchandiseShareMinor,
      shippingShareMinor: shippingShare.shippingShareMinor,
      roundingAdjustmentMinor: shippingShare.roundingAdjustmentMinor,
      totalPayableMinor,
      verifiedSavingsMinor,
    };
  });

  // Verify conservation of money: sum of member totalPayableMinor MUST strictly equal groupTotalPayableMinor
  const sumMemberPayable = memberShares.reduce((acc, m) => acc + m.totalPayableMinor, 0);
  if (shippingStatus === "KNOWN" && sumMemberPayable !== groupTotalPayableMinor) {
    throw new Error(
      `Financial invariant violated: sum of member payable (${sumMemberPayable}) !== group total (${groupTotalPayableMinor})`
    );
  }

  return {
    totalEligibleQuantity,
    baseUnitPriceMinor,
    appliedUnitPriceMinor,
    matchedTier,
    merchandiseTotalMinor,
    shippingCostMinor,
    shippingStatus,
    shippingAllocationMethod: shippingMethod,
    taxInclusion: offer.taxInclusion || "GST_EXCLUDED",
    groupTotalPayableMinor,
    verifiedSavingsTotalMinor,
    baselineComparisonSource: baselineSource,
    baselineTimestamp: offer.quoteTimestamp || new Date(),
    memberShares,
  };
};

export default {
  selectPriceTier,
  allocateShipping,
  calculatePoolPricing,
};

