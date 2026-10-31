import { describe, it, expect } from "vitest";
import { compareOffersDeterministically } from "../../src/services/supplierSearch/catalogue.service.js";
import {
  summarizeQuotes,
  quoteSummarySchema,
  generateDeterministicQuoteSummary,
} from "../../src/services/ai/advisory.service.js";
import { ApiError } from "../../src/utils/apiError.js";

describe("Deterministic Landed-Cost Offer Comparison & AI Quote Summarizer (SAH-07)", () => {
  const mockRequirement = {
    _id: "req_cup_001",
    confirmedFields: {
      productName: "12-oz Food-Safe Paper Cups",
      category: "PACKAGING",
      requestedQuantity: 50,
      quantityUnit: "BOX",
      deliveryArea: "DELHI_NCR",
    },
    currency: "INR",
  };

  const mockOffers = [
    {
      _id: "offer_bharat_01",
      supplierId: {
        _id: "supp_01",
        name: "Bharat EcoPack Wholesalers",
      },
      productId: {
        _id: "prod_01",
        canonicalName: "12-oz Food-Safe PE-Lined Paper Cups",
      },
      supplierProductDescription: "Export quality 12-oz paper cups, 1000 pcs per carton",
      packUnit: "BOX",
      packSize: "1000 cups / box",
      currency: "INR",
      baseUnitPriceMinor: 10000, // ₹100.00
      quantityTiers: [
        { minQuantity: 1, maxQuantity: 29, unitPriceMinor: 10000 },
        { minQuantity: 30, maxQuantity: 49, unitPriceMinor: 9000 },
        { minQuantity: 50, maxQuantity: null, unitPriceMinor: 8000 }, // Matches 50 -> ₹80.00
      ],
      minimumOrderQuantity: 50, // MOQ_W = 50
      retailerMoqPercentage: 20, // 20% -> MOQ_R = 10
      retailerStepPercentage: 1, // 1% -> Step = 1
      deliveryAreas: ["DELHI_NCR"],
      leadTimeDays: 3,
      shippingTerms: "EX_WORKS",
      flatShippingCostMinor: 50000, // ₹500.00
      taxInclusion: "GST_EXCLUDED",
      quoteTimestamp: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Valid for 7 days
      dataSourceType: "SEEDED_DEMO",
      verificationStatus: "VERIFIED",
    },
    {
      _id: "offer_delhi_02",
      supplierId: {
        _id: "supp_02",
        name: "Delhi Paper Mills",
      },
      productId: {
        _id: "prod_01",
        canonicalName: "12-oz Food-Safe PE-Lined Paper Cups",
      },
      supplierProductDescription: "Food grade 12-oz paper cups wholesale",
      packUnit: "BOX",
      packSize: "1000 cups / box",
      currency: "INR",
      baseUnitPriceMinor: 9500, // ₹95.00
      quantityTiers: [
        { minQuantity: 1, maxQuantity: 39, unitPriceMinor: 9500 },
        { minQuantity: 40, maxQuantity: null, unitPriceMinor: 8500 }, // Matches 50 -> ₹85.00
      ],
      minimumOrderQuantity: 40, // MOQ_W = 40
      retailerMoqPercentage: 25, // 25% -> MOQ_R = 10
      retailerStepPercentage: 2, // 2% -> Step = 1
      deliveryAreas: ["DELHI_NCR"],
      leadTimeDays: 2,
      shippingTerms: "DELIVERED_DUTY_PAID",
      flatShippingCostMinor: null, // Unknown freight
      taxInclusion: "GST_INCLUDED",
      quoteTimestamp: new Date(),
      expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      dataSourceType: "SUPPLIER_SUBMITTED",
      verificationStatus: "VERIFIED",
    },
  ];

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Deterministic Financial Math & Tier Selection Tests
  // ───────────────────────────────────────────────────────────────────────────
  describe("compareOffersDeterministically: Mathematical Grounding", () => {
    it("calculates exact price tier, merchandise total, and landed cost in integer minor units (paise)", () => {
      const result = compareOffersDeterministically(mockRequirement, mockOffers);

      expect(result.requestedQuantity).toBe(50);
      expect(result.currency).toBe("INR");
      expect(result.totalOffersCompared).toBe(2);

      // Offer 1: 50 units @ 8000 paise = 400,000 paise merchandise + 50,000 paise shipping = 450,000 paise landed
      const offer1 = result.comparisons.find((c) => c.offerId === "offer_bharat_01");
      expect(offer1).toBeDefined();
      expect(offer1.appliedUnitPriceMinor).toBe(8000);
      expect(offer1.merchandiseTotalMinor).toBe(400000);
      expect(offer1.shippingCostMinor).toBe(50000);
      expect(offer1.isShippingKnown).toBe(true);
      expect(offer1.knownLandedCostMinor).toBe(450000);

      // Offer 2: 50 units @ 8500 paise = 425,000 paise merchandise + 0 shipping = 425,000 paise known landed
      const offer2 = result.comparisons.find((c) => c.offerId === "offer_delhi_02");
      expect(offer2).toBeDefined();
      expect(offer2.appliedUnitPriceMinor).toBe(8500);
      expect(offer2.merchandiseTotalMinor).toBe(425000);
      expect(offer2.shippingCostMinor).toBeNull();
      expect(offer2.isShippingKnown).toBe(false);
      expect(offer2.knownLandedCostMinor).toBe(425000);
    });

    it("ranks offers by known landed cost ascending and computes relative savings", () => {
      const result = compareOffersDeterministically(mockRequirement, mockOffers);

      // Delhi Paper Mills (425,000 paise) < Bharat EcoPack (450,000 paise)
      expect(result.bestOfferId).toBe("offer_delhi_02");
      expect(result.comparisons[0].offerId).toBe("offer_delhi_02");
      expect(result.comparisons[1].offerId).toBe("offer_bharat_01");

      // Savings of lowest vs highest: 450,000 - 425,000 = 25,000 paise (₹250.00)
      expect(result.comparisons[0].savingsVsHighestMinor).toBe(25000);
      expect(result.comparisons[1].savingsVsHighestMinor).toBe(0);
    });

    it("correctly identifies Two-Level MOQ feasibility (MOQ_W, MOQ_R, Step, Shortfall)", () => {
      const singleUnitRequirement = {
        confirmedFields: { requestedQuantity: 5 },
      };

      const result = compareOffersDeterministically(singleUnitRequirement, mockOffers);
      const offer1 = result.comparisons.find((c) => c.offerId === "offer_bharat_01");

      // MOQ_W = 50, MOQ_R = 10, Step = 1
      expect(offer1.moqFeasibility.wholesaleMoq).toBe(50);
      expect(offer1.moqFeasibility.retailerMoq).toBe(10);
      expect(offer1.moqFeasibility.meetsWholesaleMoq).toBe(false);
      expect(offer1.moqFeasibility.meetsRetailerMoq).toBe(false); // 5 < 10
      expect(offer1.moqFeasibility.shortfallToWholesaleMoq).toBe(45); // 50 - 5 = 45
    });

    it("attaches explicit cost flags (GST_EXCLUDED, GST_INCLUDED, SHIPPING_PENDING, FLAT_SHIPPING_CONFIRMED)", () => {
      const result = compareOffersDeterministically(mockRequirement, mockOffers);

      const offer1 = result.comparisons.find((c) => c.offerId === "offer_bharat_01");
      expect(offer1.costFlags).toContain("GST_EXCLUDED");
      expect(offer1.costFlags).toContain("FLAT_SHIPPING_CONFIRMED");

      const offer2 = result.comparisons.find((c) => c.offerId === "offer_delhi_02");
      expect(offer2.costFlags).toContain("GST_INCLUDED");
      expect(offer2.costFlags).toContain("SHIPPING_PENDING");
    });

    it("evaluates quote freshness and expiry days", () => {
      const result = compareOffersDeterministically(mockRequirement, mockOffers);
      const offer1 = result.comparisons.find((c) => c.offerId === "offer_bharat_01");

      expect(offer1.quoteFreshness.isExpired).toBe(false);
      expect(offer1.quoteFreshness.daysUntilExpiry).toBeGreaterThanOrEqual(6);
    });

    it("rejects non-positive integer requested quantity with ApiError 400", () => {
      expect(() => {
        compareOffersDeterministically({ confirmedFields: { requestedQuantity: 0 } }, mockOffers);
      }).toThrow(ApiError);

      expect(() => {
        compareOffersDeterministically({ confirmedFields: { requestedQuantity: -10 } }, mockOffers);
      }).toThrow(ApiError);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. AI Quote Summarizer & Zero-Math Hallucination Guardrails
  // ───────────────────────────────────────────────────────────────────────────
  describe("summarizeQuotes: Zero-Math Contradiction Guarantee", () => {
    it("generates a Zod-compliant trade-off summary matching backend figures verbatim", async () => {
      const calculatedComparison = compareOffersDeterministically(mockRequirement, mockOffers);
      const summary = await summarizeQuotes(calculatedComparison);

      // Verify schema conformance
      expect(() => quoteSummarySchema.parse(summary)).not.toThrow();

      // Grounded figures MUST match the deterministic comparison exactly (Zero Math Hallucination)
      expect(summary.recommendedOfferId).toBe(calculatedComparison.bestOfferId);
      expect(summary.groundedFigures.lowestUnitPriceMinor).toBe(
        calculatedComparison.comparisons[0].appliedUnitPriceMinor
      );
      expect(summary.groundedFigures.bestLandedCostMinor).toBe(
        calculatedComparison.comparisons[0].knownLandedCostMinor
      );
      expect(summary.groundedFigures.potentialSavingsMinor).toBe(
        calculatedComparison.comparisons[0].savingsVsHighestMinor
      );
      expect(summary.groundedFigures.currency).toBe(calculatedComparison.currency);

      // Verify concise two-paragraph explanation structure
      expect(summary.tradeOffExplanation).toContain("\n\n");
      expect(summary.headline).toMatch(/offers the lowest landed cost/i);
      expect(summary.keyDifferentiators.length).toBeGreaterThanOrEqual(3);
    });

    it("handles comparison with zero offers gracefully without errors", async () => {
      const emptyComparison = compareOffersDeterministically(mockRequirement, []);
      const summary = await summarizeQuotes(emptyComparison);

      expect(summary.recommendedOfferId).toBe("NONE");
      expect(summary.groundedFigures.bestLandedCostMinor).toBe(0);
      expect(summary.tradeOffExplanation).toMatch(/No supplier offers currently meet/i);
    });

    it("supports both signatures: summarizeQuotes(calculatedComparison) and summarizeQuotes(offers, calculatedComparison)", async () => {
      const calculatedComparison = compareOffersDeterministically(mockRequirement, mockOffers);

      const res1 = await summarizeQuotes(calculatedComparison);
      const res2 = await summarizeQuotes(mockOffers, calculatedComparison);

      expect(res1.recommendedOfferId).toBe(res2.recommendedOfferId);
      expect(res1.groundedFigures.bestLandedCostMinor).toBe(res2.groundedFigures.bestLandedCostMinor);
    });

    it("rejects invalid or null comparison payload with clear Error", async () => {
      await expect(summarizeQuotes(null)).rejects.toThrow(/Invalid calculatedComparison/i);
      await expect(summarizeQuotes({})).rejects.toThrow(/Invalid calculatedComparison/i);
    });
  });
});

