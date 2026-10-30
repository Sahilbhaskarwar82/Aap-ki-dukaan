import { ApiError } from "../../utils/apiError.js";

/**
 * Two-Level MOQ & Step-Multiple Validation Engine (PRK-05)
 *
 * Implements deterministic mathematical rules:
 *   MOQ_R = max(1, ceil(MOQ_W * (p_min / 100)))
 *   Step  = max(1, floor(MOQ_W * (p_step / 100)))
 *
 * If explicit overrides are set on the offer (minRetailerQuantityOverride, quantityStepMultipleOverride),
 * they take precedence over the calculated percentage defaults.
 */

const DEFAULT_RETAILER_MOQ_PERCENT = 20; // 20%
const DEFAULT_RETAILER_STEP_PERCENT = 1;  // 1%

/**
 * Derives the active MOQ and Step rules for a given offer or pool configuration.
 *
 * @param {Object} offer - SupplierOffer, GroupBuyPool, or plain configuration object
 * @returns {{
 *   wholesalerMoq: number,
 *   retailerMoq: number,
 *   stepMultiple: number,
 *   retailerMoqPercent: number,
 *   retailerStepPercent: number,
 *   isOverridden: boolean
 * }}
 */
export const getOfferMoqRules = (offer) => {
  if (!offer) {
    throw new ApiError(400, "Offer or pool specification is required for MOQ rule calculation.");
  }

  // Support both SupplierOffer (minimumOrderQuantity) and GroupBuyPool (targetMoq)
  const wholesalerMoq = Number(offer.minimumOrderQuantity || offer.targetMoq);
  if (!wholesalerMoq || wholesalerMoq < 1 || !Number.isInteger(wholesalerMoq)) {
    throw new ApiError(
      400,
      `Invalid Wholesaler MOQ (MOQ_W): ${wholesalerMoq}. Must be an integer >= 1.`
    );
  }

  const pMin =
    typeof offer.retailerMoqPercentage === "number" && offer.retailerMoqPercentage > 0
      ? offer.retailerMoqPercentage
      : DEFAULT_RETAILER_MOQ_PERCENT;

  const pStep =
    typeof offer.retailerStepPercentage === "number" && offer.retailerStepPercentage > 0
      ? offer.retailerStepPercentage
      : DEFAULT_RETAILER_STEP_PERCENT;

  // Calculate default percentage-based thresholds
  const calculatedMoqR = Math.max(1, Math.ceil(wholesalerMoq * (pMin / 100)));
  const calculatedStep = Math.max(1, Math.floor(wholesalerMoq * (pStep / 100)));

  // Check explicit overrides (e.g. for box-level offers)
  const minOverride =
    offer.minRetailerQuantityOverride !== undefined && offer.minRetailerQuantityOverride !== null
      ? Number(offer.minRetailerQuantityOverride)
      : null;

  const stepOverride =
    offer.quantityStepMultipleOverride !== undefined && offer.quantityStepMultipleOverride !== null
      ? Number(offer.quantityStepMultipleOverride)
      : null;

  const retailerMoq = minOverride !== null && minOverride >= 1 ? minOverride : calculatedMoqR;
  const stepMultiple = stepOverride !== null && stepOverride >= 1 ? stepOverride : calculatedStep;
  const isOverridden = minOverride !== null || stepOverride !== null;

  return {
    wholesalerMoq,
    retailerMoq,
    stepMultiple,
    retailerMoqPercent: pMin,
    retailerStepPercent: pStep,
    isOverridden,
  };
};

/**
 * Validates a participant's proposed contribution quantity against offer MOQ rules.
 * Does not throw; returns a result object.
 *
 * @param {number} quantity
 * @param {Object} offer
 * @returns {{
 *   isValid: boolean,
 *   quantity: number,
 *   wholesalerMoq: number,
 *   retailerMoq: number,
 *   stepMultiple: number,
 *   errorCode?: string,
 *   errorMessage?: string
 * }}
 */
export const checkContributionQuantity = (quantity, offer) => {
  const rules = getOfferMoqRules(offer);
  const q = Number(quantity);

  if (!Number.isInteger(q) || q <= 0) {
    return {
      isValid: false,
      quantity: q,
      ...rules,
      errorCode: "INVALID_QUANTITY",
      errorMessage: `Quantity must be a positive integer, received: ${quantity}.`,
    };
  }

  // 1. Below Retailer Minimum Order Quantity (MOQ_R)
  if (q < rules.retailerMoq) {
    return {
      isValid: false,
      quantity: q,
      ...rules,
      errorCode: "BELOW_RETAILER_MOQ",
      errorMessage: `Quantity ${q} is below the required Retailer Minimum Order Quantity (${rules.retailerMoq} units, which is ${rules.retailerMoqPercent}% of Wholesaler MOQ ${rules.wholesalerMoq}).`,
    };
  }

  // 2. Step Multiple check: (Q mod Step) === 0
  if (q % rules.stepMultiple !== 0) {
    const lowerValid = Math.floor(q / rules.stepMultiple) * rules.stepMultiple;
    const upperValid = lowerValid + rules.stepMultiple;
    return {
      isValid: false,
      quantity: q,
      ...rules,
      errorCode: "INVALID_STEP_MULTIPLE",
      errorMessage: `Quantity ${q} is not a valid multiple of Step ${rules.stepMultiple}. Recommended valid quantities: ${lowerValid >= rules.retailerMoq ? lowerValid : rules.retailerMoq} or ${upperValid}.`,
    };
  }

  return {
    isValid: true,
    quantity: q,
    ...rules,
  };
};

/**
 * Validates a participant's proposed contribution quantity against offer MOQ rules.
 * Throws an ApiError(400) if validation fails.
 *
 * @param {number} quantity
 * @param {Object} offer
 * @returns {{
 *   wholesalerMoq: number,
 *   retailerMoq: number,
 *   stepMultiple: number,
 *   quantity: number
 * }}
 */
export const validateContributionQuantity = (quantity, offer) => {
  const check = checkContributionQuantity(quantity, offer);
  if (!check.isValid) {
    throw new ApiError(400, check.errorMessage, [check.errorCode]);
  }
  return {
    wholesalerMoq: check.wholesalerMoq,
    retailerMoq: check.retailerMoq,
    stepMultiple: check.stepMultiple,
    quantity: check.quantity,
  };
};

export default {
  getOfferMoqRules,
  checkContributionQuantity,
  validateContributionQuantity,
};

