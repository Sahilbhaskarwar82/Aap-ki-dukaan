import { describe, it, expect } from "vitest";
import {
  isPackUnitCompatible,
  filterHardConstraints,
  evaluateCandidateSpecs,
  matchProducts,
  matchingResultSchema,
  MATCHING_SYSTEM_PROMPT,
} from "../../src/services/ai/matching.service.js";

describe("Hard-Constraint Compatibility Filter & AI Candidate Matching Engine Unit Tests (SAH-06)", () => {
  // Benchmark requirement from specification
  const confirmedRequirement = {
    _id: "req_cup_001",
    productName: "12-oz Food-Safe Paper Cups",
    category: "PACKAGING",
    requestedQuantity: 50,
    quantityUnit: "BOX",
    deliveryArea: "LUCKNOW",
    confirmedFields: {
      productName: "12-oz Food-Safe Paper Cups",
      category: "PACKAGING",
      requestedQuantity: 50,
      quantityUnit: "BOX",
      deliveryArea: "LUCKNOW",
      material: "Food-grade PE-coated paper",
      capacityOrSize: "12-oz (350ml)",
      foodSafeRequired: true,
      brandConstraint: null,
    },
  };

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Stage 1: Deterministic Hard Filters
  // ───────────────────────────────────────────────────────────────────────────
  describe("Stage 1: Deterministic Hard Filters (filterHardConstraints)", () => {
    it("filters out expired offers (expiresAt <= Date.now())", () => {
      const expiredOffer = {
        _id: "offer_expired",
        packUnit: "BOX",
        deliveryAreas: ["LUCKNOW"],
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
      };

      const validOffer = {
        _id: "offer_valid",
        packUnit: "BOX",
        deliveryAreas: ["LUCKNOW"],
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Next week
      };

      const { passedOffers, rejectedOffers } = filterHardConstraints(confirmedRequirement, [
        expiredOffer,
        validOffer,
      ]);

      expect(passedOffers.length).toBe(1);
      expect(passedOffers[0]._id).toBe("offer_valid");
      expect(rejectedOffers.length).toBe(1);
      expect(rejectedOffers[0].offerId).toBe("offer_expired");
      expect(rejectedOffers[0].rejectionReason).toMatch(/expired/i);
    });

    it("filters out offers that do not service the buyer's delivery area", () => {
      const wrongAreaOffer = {
        _id: "offer_mumbai",
        packUnit: "BOX",
        deliveryAreas: ["MUMBAI", "PUNE"],
        expiresAt: new Date(Date.now() + 86400000),
      };

      const allIndiaOffer = {
        _id: "offer_all_india",
        packUnit: "BOX",
        deliveryAreas: ["ALL_INDIA"],
        expiresAt: new Date(Date.now() + 86400000),
      };

      const { passedOffers, rejectedOffers } = filterHardConstraints(confirmedRequirement, [
        wrongAreaOffer,
        allIndiaOffer,
      ]);

      expect(passedOffers.length).toBe(1);
      expect(passedOffers[0]._id).toBe("offer_all_india");
      expect(rejectedOffers.length).toBe(1);
      expect(rejectedOffers[0].offerId).toBe("offer_mumbai");
      expect(rejectedOffers[0].rejectionReason).toMatch(/delivery area.*LUCKNOW/i);
    });

    it("verifies packaging unit compatibility (BOX vs CARTON vs KG)", () => {
      expect(isPackUnitCompatible("BOX", "BOX")).toBe(true);
      expect(isPackUnitCompatible("BOX", "CARTON")).toBe(true);
      expect(isPackUnitCompatible("UNIT", "PIECE")).toBe(true);
      expect(isPackUnitCompatible("BOX", "KG")).toBe(false);
      expect(isPackUnitCompatible("UNIT", "LITRE")).toBe(false);
    });

    it("filters out incompatible packUnits with no valid conversion", () => {
      const incompatibleUnitOffer = {
        _id: "offer_incompatible_unit",
        packUnit: "KG",
        deliveryAreas: ["LUCKNOW"],
        expiresAt: new Date(Date.now() + 86400000),
      };

      const { passedOffers, rejectedOffers } = filterHardConstraints(confirmedRequirement, [
        incompatibleUnitOffer,
      ]);

      expect(passedOffers.length).toBe(0);
      expect(rejectedOffers.length).toBe(1);
      expect(rejectedOffers[0].rejectionReason).toMatch(/Incompatible packaging unit/i);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Stage 2: Specification Evaluation Benchmark from Specification
  // ───────────────────────────────────────────────────────────────────────────
  describe("Stage 2: Specification Evaluation (12-oz Paper Cups vs 8-oz Polystyrene Cups)", () => {
    it("successfully matches compatible 12-oz Food-Safe Paper Cup offers with high confidence", () => {
      const compatibleOffer = {
        _id: "offer_compatible_cups",
        packUnit: "BOX",
        deliveryAreas: ["LUCKNOW"],
        expiresAt: new Date(Date.now() + 86400000),
        productId: {
          canonicalName: "12-oz Food-Safe PE-Lined Paper Cups",
          category: "PACKAGING",
          specifications: {
            material: "Food-grade PE-coated paper",
            capacityOrSize: "12-oz",
            foodSafe: true,
          },
        },
      };

      const evalResult = evaluateCandidateSpecs(confirmedRequirement, compatibleOffer);

      expect(evalResult.isCompatible).toBe(true);
      expect(evalResult.requiresSubstitutionApproval).toBe(false);
      expect(evalResult.detectedMismatches.length).toBe(0);
      expect(evalResult.confidenceScore).toBeGreaterThanOrEqual(0.9);
      expect(evalResult.matchReasons.length).toBeGreaterThan(0);
    });

    it("accurately flags '8-oz Polystyrene Cups' as incompatible and requires substitution approval", () => {
      const conflictingOffer = {
        _id: "offer_polystyrene_cups",
        packUnit: "BOX",
        deliveryAreas: ["LUCKNOW"],
        expiresAt: new Date(Date.now() + 86400000),
        productId: {
          canonicalName: "8-oz Polystyrene Cups",
          category: "PACKAGING",
          specifications: {
            material: "Polystyrene foam",
            capacityOrSize: "8-oz",
            foodSafe: false,
          },
        },
      };

      const evalResult = evaluateCandidateSpecs(confirmedRequirement, conflictingOffer);

      // Must be flagged as incompatible or low confidence
      expect(evalResult.isCompatible).toBe(false);
      expect(evalResult.requiresSubstitutionApproval).toBe(true);
      expect(evalResult.confidenceScore).toBeLessThan(0.5);

      // Verify explicit mismatches for both material and capacity
      const allMismatches = evalResult.detectedMismatches.join(" ");
      expect(allMismatches).toMatch(/material/i);
      expect(allMismatches).toMatch(/capacity|8-oz/i);
    });

    it("enforces rule: material differences MUST set requiresSubstitutionApproval to true", () => {
      const materialDifferenceOffer = {
        _id: "offer_bamboo_cups",
        packUnit: "BOX",
        deliveryAreas: ["LUCKNOW"],
        expiresAt: new Date(Date.now() + 86400000),
        productId: {
          canonicalName: "12-oz Bamboo Fiber Cups",
          category: "PACKAGING",
          specifications: {
            material: "Bamboo fiber composite",
            capacityOrSize: "12-oz",
            foodSafe: true,
          },
        },
      };

      const evalResult = evaluateCandidateSpecs(confirmedRequirement, materialDifferenceOffer);

      expect(evalResult.requiresSubstitutionApproval).toBe(true);
      expect(evalResult.detectedMismatches.some((m) => m.includes("Material"))).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. End-to-End Two-Stage Matching (matchProducts)
  // ───────────────────────────────────────────────────────────────────────────
  describe("End-to-End Matching Pipeline (matchProducts)", () => {
    it("evaluates a mixed candidate pool, filters expired/unsupported offers, and returns ranked matches", async () => {
      const candidates = [
        // 1. Exact compatible match
        {
          _id: "offer_1_exact",
          packUnit: "BOX",
          deliveryAreas: ["LUCKNOW"],
          expiresAt: new Date(Date.now() + 86400000),
          productId: {
            canonicalName: "12-oz Food-Safe Paper Cups",
            category: "PACKAGING",
            specifications: {
              material: "Food-grade PE-coated paper",
              capacityOrSize: "12-oz",
              foodSafe: true,
            },
          },
        },
        // 2. Material difference (requires substitution approval)
        {
          _id: "offer_2_bamboo",
          packUnit: "BOX",
          deliveryAreas: ["LUCKNOW"],
          expiresAt: new Date(Date.now() + 86400000),
          productId: {
            canonicalName: "12-oz Bamboo Cups",
            category: "PACKAGING",
            specifications: {
              material: "Bamboo fiber",
              capacityOrSize: "12-oz",
              foodSafe: true,
            },
          },
        },
        // 3. Incompatible material + size (8-oz Polystyrene)
        {
          _id: "offer_3_polystyrene",
          packUnit: "BOX",
          deliveryAreas: ["LUCKNOW"],
          expiresAt: new Date(Date.now() + 86400000),
          productId: {
            canonicalName: "8-oz Polystyrene Cups",
            category: "PACKAGING",
            specifications: {
              material: "Polystyrene",
              capacityOrSize: "8-oz",
              foodSafe: false,
            },
          },
        },
        // 4. Expired offer (fails Stage 1)
        {
          _id: "offer_4_expired",
          packUnit: "BOX",
          deliveryAreas: ["LUCKNOW"],
          expiresAt: new Date(Date.now() - 3600000),
          productId: {
            canonicalName: "12-oz Cups",
            specifications: { material: "Paper", capacityOrSize: "12-oz" },
          },
        },
      ];

      const result = await matchProducts(confirmedRequirement, candidates);

      // Verify adherence to Zod schema
      expect(matchingResultSchema.safeParse(result).success).toBe(true);

      // Check stats
      expect(result.totalEvaluated).toBe(4);
      expect(result.qualifiedMatches.length).toBe(2); // offer_1 and offer_2
      expect(result.filteredOutOffers.length).toBe(2); // offer_4 (expired) and offer_3 (severe mismatch)

      // Top ranked must be the exact match without substitution approval
      expect(result.qualifiedMatches[0].offerId).toBe("offer_1_exact");
      expect(result.qualifiedMatches[0].requiresSubstitutionApproval).toBe(false);

      // Second ranked requires substitution approval
      expect(result.qualifiedMatches[1].offerId).toBe("offer_2_bamboo");
      expect(result.qualifiedMatches[1].requiresSubstitutionApproval).toBe(true);

      // Verify filtered out offers contain the expired offer and polystyrene offer
      const filteredIds = result.filteredOutOffers.map((f) => f.offerId);
      expect(filteredIds).toContain("offer_4_expired");
      expect(filteredIds).toContain("offer_3_polystyrene");
    });

    it("verifies system prompt contains mandatory substitution approval directive", () => {
      expect(MATCHING_SYSTEM_PROMPT).toContain('"requiresSubstitutionApproval" to true');
      expect(MATCHING_SYSTEM_PROMPT).toContain("NEVER auto-merge or silently accept");
    });
  });
});
