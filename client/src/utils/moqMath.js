/**
 * Reusable MOQ and Order-Step Math Utilities — Aap-ki-dukaan (SUJ-01)
 *
 * Implements business rules for:
 *  - Wholesaler Minimum Order Quantity (MOQ_W)
 *  - Retailer Minimum Commitment (MOQ_R = 20% of MOQ_W)
 *  - Retailer Step Multiple (Step = 1% of MOQ_W)
 *  - Bulk pricing tier resolution and threshold progress
 */

/**
 * Calculates Retailer MOQ (MOQ_R = 20% of MOQ_W by default).
 * @param {number} targetMoq - Wholesaler MOQ
 * @param {number} [retailerMoqPercentage=20]
 * @returns {number}
 */
export function calcRetailerMoq(targetMoq, retailerMoqPercentage = 20) {
  if (!Number.isFinite(targetMoq) || targetMoq <= 0) return 1;
  const pct = Number.isFinite(retailerMoqPercentage) && retailerMoqPercentage > 0 ? retailerMoqPercentage : 20;
  return Math.max(1, Math.ceil((targetMoq * pct) / 100));
}

/**
 * Calculates Quantity Step Multiple (Step = 1% of MOQ_W by default, min 1).
 * @param {number} targetMoq - Wholesaler MOQ
 * @param {number} [retailerStepPercentage=1]
 * @returns {number}
 */
export function calcStepMultiple(targetMoq, retailerStepPercentage = 1) {
  if (!Number.isFinite(targetMoq) || targetMoq <= 0) return 1;
  const pct = Number.isFinite(retailerStepPercentage) && retailerStepPercentage > 0 ? retailerStepPercentage : 1;
  return Math.max(1, Math.floor((targetMoq * pct) / 100));
}

/**
 * Validates a buyer-selected order quantity against Retailer MOQ and Step constraints.
 *
 * @param {number} quantity - Quantity to validate
 * @param {object} config
 * @param {number} config.targetMoq - Wholesaler MOQ
 * @param {number} [config.retailerMoqPercentage=20]
 * @param {number} [config.retailerStepPercentage=1]
 * @param {number} [config.minRetailerQuantity] - Explicit override if already computed
 * @param {number} [config.quantityStepMultiple] - Explicit override if already computed
 * @returns {{ isValid: boolean, error: string | null, moqR: number, step: number }}
 */
export function validateQuantity(quantity, config = {}) {
  const {
    targetMoq,
    retailerMoqPercentage = 20,
    retailerStepPercentage = 1,
    minRetailerQuantity,
    quantityStepMultiple,
  } = config;

  const moqR = minRetailerQuantity || calcRetailerMoq(targetMoq, retailerMoqPercentage);
  const step = quantityStepMultiple || calcStepMultiple(targetMoq, retailerStepPercentage);

  if (quantity === null || quantity === undefined || !Number.isFinite(quantity) || quantity <= 0) {
    return {
      isValid: false,
      error: `Please enter a valid quantity of at least ${moqR}.`,
      moqR,
      step,
    };
  }

  if (quantity < moqR) {
    return {
      isValid: false,
      error: `Minimum order requirement is ${moqR} units.`,
      moqR,
      step,
    };
  }

  if (step > 1 && quantity % step !== 0) {
    return {
      isValid: false,
      error: `Quantity must be in multiples of ${step} (e.g., ${Math.ceil(quantity / step) * step}).`,
      moqR,
      step,
    };
  }

  return {
    isValid: true,
    error: null,
    moqR,
    step,
  };
}

/**
 * Snaps a given quantity to the nearest valid order quantity that meets
 * the minimum Retailer MOQ and is an exact multiple of Step.
 *
 * @param {number} quantity
 * @param {object} config
 * @returns {number}
 */
export function nearestValidQuantity(quantity, config = {}) {
  const {
    targetMoq,
    retailerMoqPercentage = 20,
    retailerStepPercentage = 1,
    minRetailerQuantity,
    quantityStepMultiple,
  } = config;

  const moqR = minRetailerQuantity || calcRetailerMoq(targetMoq, retailerMoqPercentage);
  const step = quantityStepMultiple || calcStepMultiple(targetMoq, retailerStepPercentage);

  const rawQty = Math.max(moqR, Number.isFinite(quantity) ? quantity : moqR);
  if (step <= 1) return Math.round(rawQty);

  const snapped = Math.round(rawQty / step) * step;
  return Math.max(moqR, snapped);
}

/**
 * Calculates remaining units required to reach Wholesaler MOQ.
 * @param {number} totalEligibleQuantity
 * @param {number} targetMoq
 * @returns {number}
 */
export function remainingForMoq(totalEligibleQuantity, targetMoq) {
  if (!Number.isFinite(targetMoq) || targetMoq <= 0) return 0;
  const current = Number.isFinite(totalEligibleQuantity) ? Math.max(0, totalEligibleQuantity) : 0;
  return Math.max(0, targetMoq - current);
}

/**
 * Calculates percentage completion toward Wholesaler MOQ (0% - 100%+).
 * @param {number} totalEligibleQuantity
 * @param {number} targetMoq
 * @returns {number}
 */
export function calcMoqProgressPercentage(totalEligibleQuantity, targetMoq) {
  if (!Number.isFinite(targetMoq) || targetMoq <= 0) return 0;
  const current = Number.isFinite(totalEligibleQuantity) ? Math.max(0, totalEligibleQuantity) : 0;
  return Math.min(100, Math.round((current / targetMoq) * 100));
}

/**
 * Resolves the currently active pricing tier and next target discount tier
 * given total pooled quantity.
 *
 * @param {number} totalQuantity - Combined pooled quantity
 * @param {Array<{ minQuantity: number, unitPriceMinor: number }>} [tiers=[]] - Discount tiers
 * @param {number} [baseUnitPriceMinor=0] - Default baseline price when no tier is hit
 * @returns {{
 *   currentTier: { minQuantity: number, unitPriceMinor: number } | null,
 *   nextTier: { minQuantity: number, unitPriceMinor: number } | null,
 *   unitsToNextTier: number,
 *   unitPriceMinor: number,
 *   isMaxTier: boolean
 * }}
 */
export function findApplicableTier(totalQuantity, tiers = [], baseUnitPriceMinor = 0) {
  const qty = Number.isFinite(totalQuantity) ? Math.max(0, totalQuantity) : 0;

  // Clean and sort tiers ascending by minQuantity
  const sortedTiers = (Array.isArray(tiers) ? tiers : [])
    .filter((t) => t && Number.isFinite(t.minQuantity) && Number.isFinite(t.unitPriceMinor))
    .sort((a, b) => a.minQuantity - b.minQuantity);

  let currentTier = null;
  let nextTier = null;

  for (let i = 0; i < sortedTiers.length; i++) {
    if (qty >= sortedTiers[i].minQuantity) {
      currentTier = sortedTiers[i];
    } else if (!nextTier) {
      nextTier = sortedTiers[i];
    }
  }

  const unitPriceMinor = currentTier ? currentTier.unitPriceMinor : baseUnitPriceMinor;
  const unitsToNextTier = nextTier ? Math.max(0, nextTier.minQuantity - qty) : 0;
  const isMaxTier = sortedTiers.length > 0 && currentTier === sortedTiers[sortedTiers.length - 1];

  return {
    currentTier,
    nextTier,
    unitsToNextTier,
    unitPriceMinor,
    isMaxTier,
  };
}

