import { z } from "zod";
import { executeAIWithGuardrails } from "./aiAdapter.service.js";

/**
 * Task SAH-06: Hard-Constraint Compatibility Filter & AI Candidate Matching Engine
 *
 * Implements a robust Two-Stage matching architecture between a CONFIRMED
 * purchasing requirement and candidate wholesale SupplierOffer records:
 *
 * - Stage 1 (Deterministic Hard Filters):
 *   1. Quote Expiry: filters out offers with `expiresAt <= Date.now()`.
 *   2. Regional Routing: filters out offers that do not service the requirement's delivery area.
 *   3. Pack Unit Compatibility: filters out offers with incompatible packaging units
 *      where no valid conversion exists (e.g., BOX vs KG).
 *
 * - Stage 2 (Specification & Attribute Evaluation):
 *   Compares capacityOrSize, material, foodSafe certification, and brand constraints.
 *   Strict Rule: If material, capacity, or brand differs in ANY way from the requirement,
 *   `requiresSubstitutionApproval` MUST be set to true. Never auto-merge conflicting specifications.
 */

// Schema for an individual evaluated candidate match
export const matchCandidateOfferSchema = z.object({
  offerId: z.string(),
  isCompatible: z.boolean(),
  matchReasons: z.array(z.string()).default([]),
  detectedMismatches: z.array(z.string()).default([]),
  requiresSubstitutionApproval: z.boolean().default(false),
  confidenceScore: z.number().min(0).max(1),
  supplierName: z.string().optional(),
  productName: z.string().optional(),
});

// Schema for the complete two-stage matching response
export const matchingResultSchema = z.object({
  qualifiedMatches: z.array(matchCandidateOfferSchema),
  filteredOutOffers: z.array(
    z.object({
      offerId: z.string(),
      rejectionStage: z.enum(["STAGE_1_HARD_FILTER", "STAGE_2_SPEC_MISMATCH"]),
      rejectionReason: z.string(),
    })
  ),
  totalEvaluated: z.number(),
  totalQualified: z.number(),
});

// Compatible Packaging Unit Synonyms / Equivalence Map
const COMPATIBLE_UNIT_GROUPS = Object.freeze({
  BOX: new Set(["BOX", "CARTON", "CASE", "CRATE"]),
  CARTON: new Set(["BOX", "CARTON", "CASE", "CRATE"]),
  CASE: new Set(["BOX", "CARTON", "CASE", "CRATE"]),
  UNIT: new Set(["UNIT", "PIECE", "PIECES", "PCS", "ITEM", "EACH"]),
  PIECE: new Set(["UNIT", "PIECE", "PIECES", "PCS", "ITEM", "EACH"]),
  PCS: new Set(["UNIT", "PIECE", "PIECES", "PCS", "ITEM", "EACH"]),
  ITEM: new Set(["UNIT", "PIECE", "PIECES", "PCS", "ITEM", "EACH"]),
  BAG: new Set(["BAG", "SACK", "POUCH"]),
  PACK: new Set(["PACK", "PACKET", "BUNDLE"]),
  ROLL: new Set(["ROLL", "REEL"]),
});

/**
 * Determines whether two packaging units are logically compatible.
 *
 * @param {string} reqUnit - Unit from requirement (e.g. "BOX")
 * @param {string} offerUnit - Unit from offer (e.g. "CARTON")
 * @returns {boolean}
 */
export function isPackUnitCompatible(reqUnit, offerUnit) {
  if (!reqUnit || !offerUnit) return true; // Flexible if unspecified

  const u1 = reqUnit.trim().toUpperCase();
  const u2 = offerUnit.trim().toUpperCase();

  if (u1 === u2) return true;

  const group = COMPATIBLE_UNIT_GROUPS[u1];
  if (group && group.has(u2)) return true;

  return false;
}

export const MATCHING_SYSTEM_PROMPT = `
You are the Chief Compatibility & Specification Evaluation AI for Aap Ki Dukan (CoBuy AI).
Your objective is to compare a buyer's CONFIRMED procurement requirement against candidate supplier offers.

[CRITICAL PROMPT CONSTRAINT ON SUBSTITUTION & SPECIFICATIONS]
If the material, capacity, dimensions, or brand differs in ANY way from the buyer's requirement, you MUST:
1. Set "requiresSubstitutionApproval" to true.
2. Clearly list the exact discrepancy in the "detectedMismatches" array.
3. NEVER auto-merge or silently accept conflicting specifications (e.g., Polystyrene when Paper was requested, or 8-oz when 12-oz was requested).
4. If the product is fundamentally unusable for the buyer's intended purpose, mark "isCompatible" as false and set a low confidence score (< 0.50).

Return ONLY a valid JSON object matching this schema:
{
  "matches": [
    {
      "offerId": string,
      "isCompatible": boolean,
      "matchReasons": ["List of matching specifications"],
      "detectedMismatches": ["List of discrepancies, if any"],
      "requiresSubstitutionApproval": boolean,
      "confidenceScore": number between 0.0 and 1.0
    }
  ]
}
`.trim();

/**
 * Stage 1: Deterministic Hard Constraint Filtering
 *
 * Checks:
 * 1. Quote Expiry (expiresAt > now)
 * 2. Delivery Area Coverage (deliveryAreas includes target or "ALL_INDIA")
 * 3. Pack Unit Compatibility
 *
 * @param {object} requirement - Confirmed requirement object
 * @param {Array<object>} candidateOffers - Array of SupplierOffer records
 * @returns {{ passedOffers: Array<object>, rejectedOffers: Array<object> }}
 */
export function filterHardConstraints(requirement, candidateOffers = []) {
  const now = new Date();
  const reqFields = requirement.confirmedFields || requirement;
  const targetArea = (reqFields.deliveryArea || requirement.deliveryArea || "").trim().toUpperCase();
  const targetUnit = (reqFields.quantityUnit || requirement.quantityUnit || "").trim().toUpperCase();

  const passedOffers = [];
  const rejectedOffers = [];

  for (const offer of candidateOffers) {
    const offerId = (offer._id || offer.id || String(offer)).toString();

    // 1. Expiration Filter
    if (offer.expiresAt && new Date(offer.expiresAt) <= now) {
      rejectedOffers.push({
        offerId,
        offer,
        rejectionStage: "STAGE_1_HARD_FILTER",
        rejectionReason: `Offer quote has expired on ${new Date(offer.expiresAt).toISOString()}.`,
      });
      continue;
    }

    // 2. Delivery Area Filter
    if (targetArea) {
      const areas = Array.isArray(offer.deliveryAreas)
        ? offer.deliveryAreas.map((a) => a.trim().toUpperCase())
        : [];

      const coversArea = areas.includes(targetArea) || areas.includes("ALL_INDIA");
      if (!coversArea) {
        rejectedOffers.push({
          offerId,
          offer,
          rejectionStage: "STAGE_1_HARD_FILTER",
          rejectionReason: `Delivery area '${targetArea}' is not serviced by this offer (serviced: ${areas.join(", ") || "None"}).`,
        });
        continue;
      }
    }

    // 3. Pack Unit Compatibility Filter
    if (targetUnit && offer.packUnit) {
      const compatible = isPackUnitCompatible(targetUnit, offer.packUnit);
      if (!compatible) {
        rejectedOffers.push({
          offerId,
          offer,
          rejectionStage: "STAGE_1_HARD_FILTER",
          rejectionReason: `Incompatible packaging unit: requirement requires '${targetUnit}', but offer is in '${offer.packUnit}' with no valid conversion.`,
        });
        continue;
      }
    }

    passedOffers.push(offer);
  }

  return { passedOffers, rejectedOffers };
}

/**
 * Stage 2 Deterministic Specification Evaluation Engine
 * Evaluates attributes when AI is offline or in mock mode.
 *
 * @param {object} requirement
 * @param {object} offer
 * @returns {object} Evaluated candidate match
 */
export function evaluateCandidateSpecs(requirement, offer) {
  const reqFields = requirement.confirmedFields || requirement;
  const product = offer.productId && typeof offer.productId === "object" ? offer.productId : {};
  const specs = product.specifications || {};

  const offerId = (offer._id || offer.id || String(offer)).toString();
  const matchReasons = [];
  const detectedMismatches = [];
  let requiresSubstitutionApproval = false;
  let confidenceScore = 0.95;
  let isCompatible = true;

  // 1. Capacity / Size Evaluation
  const reqCapacity = (reqFields.capacityOrSize || "").toLowerCase().trim();
  const offerCapacity = (specs.capacityOrSize || offer.packSize || "").toLowerCase().trim();

  if (reqCapacity && offerCapacity) {
    const extractDigits = (str) => {
      const match = str.match(/\d+(\.\d+)?/);
      return match ? parseFloat(match[0]) : null;
    };

    const reqNum = extractDigits(reqCapacity);
    const offerNum = extractDigits(offerCapacity);

    if (reqNum && offerNum && Math.abs(reqNum - offerNum) > 0.01) {
      detectedMismatches.push(
        `Capacity difference: requested ${reqCapacity}, but offer provides ${offerCapacity}.`
      );
      requiresSubstitutionApproval = true;
      confidenceScore -= 0.35;

      // Flag incompatible if capacity variance is severe (e.g. 8-oz vs 12-oz = 33% smaller)
      if (Math.abs(reqNum - offerNum) >= 3) {
        isCompatible = false;
      }
    } else {
      matchReasons.push(`Volume/capacity aligned (${offerCapacity}).`);
    }
  }

  // 2. Material Evaluation
  const reqMaterial = (reqFields.material || "").toLowerCase().trim();
  const offerMaterial = (specs.material || "").toLowerCase().trim();

  if (reqMaterial && offerMaterial) {
    const isReqPaper = /paper|kraft|cardboard/i.test(reqMaterial);
    const isOfferPaper = /paper|kraft|cardboard/i.test(offerMaterial);
    const isOfferPlastic = /polystyrene|plastic|foam|styrofoam|pet|pp/i.test(offerMaterial);

    if (isReqPaper && isOfferPlastic) {
      detectedMismatches.push(
        `Critical material mismatch: requested '${reqFields.material}', but offer is made of '${specs.material}'.`
      );
      requiresSubstitutionApproval = true;
      isCompatible = false;
      confidenceScore = Math.min(confidenceScore, 0.4);
    } else if (reqMaterial !== offerMaterial) {
      detectedMismatches.push(
        `Material variation: requested '${reqFields.material}', offer specifies '${specs.material}'.`
      );
      requiresSubstitutionApproval = true;
      confidenceScore -= 0.15;
    } else {
      matchReasons.push(`Material matched (${specs.material}).`);
    }
  }

  // 3. Food Safe Certification Evaluation
  const reqFoodSafe = reqFields.foodSafeRequired === true;
  const offerFoodSafe = specs.foodSafe === true;

  if (reqFoodSafe && !offerFoodSafe) {
    detectedMismatches.push("Food-safe certification required by buyer but not certified by supplier.");
    requiresSubstitutionApproval = true;
    confidenceScore -= 0.25;
  } else if (reqFoodSafe && offerFoodSafe) {
    matchReasons.push("Food-safe certified specification verified.");
  }

  // 4. Brand Constraint Evaluation
  const reqBrand = (reqFields.brandConstraint || "").toLowerCase().trim();
  const offerBrand = (product.brand || product.brandConstraint || "generic").toLowerCase().trim();

  if (reqBrand && reqBrand !== "generic" && reqBrand !== offerBrand) {
    detectedMismatches.push(`Brand constraint '${reqFields.brandConstraint}' not matched by offer brand '${product.brand || "GENERIC"}'.`);
    requiresSubstitutionApproval = true;
    confidenceScore -= 0.2;
  }

  // 5. General matching explanation
  if (detectedMismatches.length === 0) {
    matchReasons.push("All core specifications, materials, and delivery terms match buyer requirements.");
  }

  confidenceScore = Math.max(0.1, Math.min(1.0, parseFloat(confidenceScore.toFixed(2))));

  return {
    offerId,
    isCompatible,
    matchReasons,
    detectedMismatches,
    requiresSubstitutionApproval,
    confidenceScore,
    supplierName: offer.supplierId?.name || "Wholesale Supplier",
    productName: product.canonicalName || offer.supplierProductDescription || "Product Offer",
  };
}

/**
 * Task SAH-06: matchProducts
 *
 * Executes the full Two-Stage Candidate Matching Engine:
 * Stage 1: Deterministic Hard Filter (Expiry, Delivery Area, Pack Unit)
 * Stage 2: Attribute & Specification Compatibility Evaluation
 *
 * @param {object} requirement - The CONFIRMED requirement record
 * @param {Array<object>} candidateOffers - All potentially candidate SupplierOffer records
 * @param {object} [options={}] - Tracing IDs, custom limits
 * @returns {Promise<z.infer<typeof matchingResultSchema>>}
 */
export async function matchProducts(requirement, candidateOffers = [], options = {}) {
  if (!requirement || typeof requirement !== "object") {
    throw new Error("Invalid requirement: must be a valid requirement object.");
  }

  const totalEvaluated = candidateOffers.length;

  // ───────────────────────────────────────────────────────────────────────────
  // STAGE 1: Deterministic Hard Filters
  // ───────────────────────────────────────────────────────────────────────────
  const { passedOffers, rejectedOffers } = filterHardConstraints(requirement, candidateOffers);

  // If no offers survived Stage 1, return empty matches early
  if (passedOffers.length === 0) {
    return {
      qualifiedMatches: [],
      filteredOutOffers: rejectedOffers.map((r) => ({
        offerId: r.offerId,
        rejectionStage: r.rejectionStage,
        rejectionReason: r.rejectionReason,
      })),
      totalEvaluated,
      totalQualified: 0,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // STAGE 2: Specification & Attribute Evaluation
  // ───────────────────────────────────────────────────────────────────────────
  const evaluatedMatches = [];
  const specMismatches = [];

  for (const offer of passedOffers) {
    const evalResult = evaluateCandidateSpecs(requirement, offer);

    if (!evalResult.isCompatible && evalResult.confidenceScore < 0.5) {
      specMismatches.push({
        offerId: evalResult.offerId,
        rejectionStage: "STAGE_2_SPEC_MISMATCH",
        rejectionReason: evalResult.detectedMismatches.join("; ") || "Specifications fundamentally incompatible.",
      });
    } else {
      evaluatedMatches.push(evalResult);
    }
  }

  // Rank matches: exact matches first (requiresSubstitutionApproval = false), then by confidenceScore descending
  evaluatedMatches.sort((a, b) => {
    if (a.requiresSubstitutionApproval !== b.requiresSubstitutionApproval) {
      return a.requiresSubstitutionApproval ? 1 : -1;
    }
    return b.confidenceScore - a.confidenceScore;
  });

  const allFilteredOut = [
    ...rejectedOffers.map((r) => ({
      offerId: r.offerId,
      rejectionStage: r.rejectionStage,
      rejectionReason: r.rejectionReason,
    })),
    ...specMismatches,
  ];

  const result = {
    qualifiedMatches: evaluatedMatches,
    filteredOutOffers: allFilteredOut,
    totalEvaluated,
    totalQualified: evaluatedMatches.length,
  };

  return matchingResultSchema.parse(result);
}

export default {
  matchCandidateOfferSchema,
  matchingResultSchema,
  isPackUnitCompatible,
  filterHardConstraints,
  evaluateCandidateSpecs,
  matchProducts,
};
