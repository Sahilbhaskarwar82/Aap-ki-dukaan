import { describe, it, expect } from "vitest";
import {
  getOfferMoqRules,
  checkContributionQuantity,
  validateContributionQuantity,
} from "../../src/services/pricing/moqValidator.service.js";

describe("Two-Level MOQ & Step Validator Unit Tests (PRK-05)", () => {
  // ───────────────────────────────────────────────────────────────────────────
  // 1. Mandatory Benchmark Test from Specification
  // ───────────────────────────────────────────────────────────────────────────
  describe("Mandatory 1000-unit benchmark test", () => {
    const offer = {
      minimumOrderQuantity: 1000,
      retailerMoqPercentage: 20,
      retailerStepPercentage: 1,
    };

    it("derives MOQ_R = 200 and Step = 10 correctly", () => {
      const rules = getOfferMoqRules(offer);
      expect(rules.wholesalerMoq).toBe(1000);
      expect(rules.retailerMoq).toBe(200);
      expect(rules.stepMultiple).toBe(10);
      expect(rules.isOverridden).toBe(false);
    });

    it("rejects 190 with BELOW_RETAILER_MOQ", () => {
      const check = checkContributionQuantity(190, offer);
      expect(check.isValid).toBe(false);
      expect(check.errorCode).toBe("BELOW_RETAILER_MOQ");
      expect(check.errorMessage).toContain("below the required Retailer Minimum Order Quantity (200 units");

      expect(() => validateContributionQuantity(190, offer)).toThrowError(
        /below the required Retailer Minimum Order Quantity/
      );
    });

    it("rejects 205 with INVALID_STEP_MULTIPLE", () => {
      const check = checkContributionQuantity(205, offer);
      expect(check.isValid).toBe(false);
      expect(check.errorCode).toBe("INVALID_STEP_MULTIPLE");
      expect(check.errorMessage).toContain("not a valid multiple of Step 10");

      expect(() => validateContributionQuantity(205, offer)).toThrowError(
        /not a valid multiple of Step 10/
      );
    });

    it("accepts valid quantities: 200, 210, 590, 1000", () => {
      [200, 210, 590, 1000].forEach((q) => {
        const check = checkContributionQuantity(q, offer);
        expect(check.isValid).toBe(true);
        expect(check.quantity).toBe(q);

        const validated = validateContributionQuantity(q, offer);
        expect(validated.quantity).toBe(q);
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Explicit Overrides (Box-Level Offers)
  // ───────────────────────────────────────────────────────────────────────────
  describe("Explicit Overrides (e.g. Box Offers)", () => {
    const boxOffer = {
      minimumOrderQuantity: 50,
      minRetailerQuantityOverride: 10,
      quantityStepMultipleOverride: 5,
    };

    it("respects explicit overrides over calculated percentages", () => {
      const rules = getOfferMoqRules(boxOffer);
      expect(rules.wholesalerMoq).toBe(50);
      expect(rules.retailerMoq).toBe(10);
      expect(rules.stepMultiple).toBe(5);
      expect(rules.isOverridden).toBe(true);
    });

    it("rejects 9 with BELOW_RETAILER_MOQ and 12 with INVALID_STEP_MULTIPLE", () => {
      expect(checkContributionQuantity(9, boxOffer).errorCode).toBe("BELOW_RETAILER_MOQ");
      expect(checkContributionQuantity(12, boxOffer).errorCode).toBe("INVALID_STEP_MULTIPLE");
    });

    it("accepts valid box quantities: 10, 15, 20, 25", () => {
      [10, 15, 20, 25].forEach((q) => {
        expect(checkContributionQuantity(q, boxOffer).isValid).toBe(true);
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Mathematical Edge Cases & Ceil/Floor Clamping
  // ───────────────────────────────────────────────────────────────────────────
  describe("Mathematical edge cases & floor/ceil clamping", () => {
    it("handles MOQ_W = 99 (ceil for MOQ_R and floor clamped to 1 for Step)", () => {
      const oddOffer = {
        minimumOrderQuantity: 99,
        retailerMoqPercentage: 20, // 99 * 0.20 = 19.8 -> ceil = 20
        retailerStepPercentage: 1,  // 99 * 0.01 = 0.99 -> floor = 0 -> clamped to 1
      };

      const rules = getOfferMoqRules(oddOffer);
      expect(rules.retailerMoq).toBe(20);
      expect(rules.stepMultiple).toBe(1);

      expect(checkContributionQuantity(19, oddOffer).isValid).toBe(false);
      expect(checkContributionQuantity(20, oddOffer).isValid).toBe(true);
      expect(checkContributionQuantity(21, oddOffer).isValid).toBe(true);
    });

    it("works when offer uses targetMoq property (GroupBuyPool format)", () => {
      const pool = {
        targetMoq: 500,
        retailerMoqPercentage: 20,
        retailerStepPercentage: 2,
      };

      const rules = getOfferMoqRules(pool);
      expect(rules.wholesalerMoq).toBe(500);
      expect(rules.retailerMoq).toBe(100);
      expect(rules.stepMultiple).toBe(10);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Input Validation & Error Handling
  // ───────────────────────────────────────────────────────────────────────────
  describe("Invalid input handling", () => {
    const offer = { minimumOrderQuantity: 100 };

    it("rejects non-positive, non-integer, or NaN quantities", () => {
      [0, -10, 20.5, NaN, "abc", null, undefined].forEach((invalidQ) => {
        const check = checkContributionQuantity(invalidQ, offer);
        expect(check.isValid).toBe(false);
        expect(check.errorCode).toBe("INVALID_QUANTITY");
      });
    });

    it("throws when offer is null or missing minimumOrderQuantity", () => {
      expect(() => getOfferMoqRules(null)).toThrow();
      expect(() => getOfferMoqRules({})).toThrow();
      expect(() => getOfferMoqRules({ minimumOrderQuantity: 0 })).toThrow();
      expect(() => getOfferMoqRules({ minimumOrderQuantity: -5 })).toThrow();
    });
  });
});

