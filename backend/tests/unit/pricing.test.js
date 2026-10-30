import { describe, it, expect } from "vitest";
import {
  selectPriceTier,
  allocateShipping,
  calculatePoolPricing,
} from "../../src/services/pricing/pricingEngine.service.js";

describe("Deterministic Pricing Engine Unit Tests (PRK-06)", () => {
  // ───────────────────────────────────────────────────────────────────────────
  // 1. Mandatory ₹4,800 Benchmark Test from Specification
  // ───────────────────────────────────────────────────────────────────────────
  describe("Mandatory ₹4,800 Calculation Benchmark Test", () => {
    /**
     * Offer Specification:
     * - Base price: ₹100 / box (10,000 paise)
     * - Tier 1: 30–49 boxes -> ₹90 / box (9,000 paise)
     * - Tier 2: >= 50 boxes -> ₹80 / box (8,000 paise)
     *
     * Member Contributions:
     * - Shop 1: 20 boxes
     * - Shop 2: 15 boxes
     * - Shop 3: 25 boxes
     *
     * Expected Results:
     * - Total Q_pool = 60 boxes
     * - Applied Tier: ₹80 / box
     * - Group Merchandise Total: 60 * ₹80 = ₹4,800.00 (480,000 paise)
     * - Member 1 Share: 20 * ₹80 = ₹1,600.00 (160,000 paise), Savings: ₹400 (40,000 paise)
     * - Member 2 Share: 15 * ₹80 = ₹1,200.00 (120,000 paise), Savings: ₹300 (30,000 paise)
     * - Member 3 Share: 25 * ₹80 = ₹2,000.00 (200,000 paise), Savings: ₹500 (50,000 paise)
     * - Total Group Savings: ₹1,200.00 (120,000 paise)
     */
    const offer = {
      baseUnitPriceMinor: 10000, // ₹100.00
      quantityTiers: [
        { minQuantity: 30, maxQuantity: 49, unitPriceMinor: 9000 }, // ₹90.00
        { minQuantity: 50, maxQuantity: null, unitPriceMinor: 8000 }, // ₹80.00
      ],
      packUnit: "BOX",
      shippingAllocationMethod: "PER_UNIT",
      flatShippingCostMinor: null, // Excluded/pending
    };

    const contributions = [
      { contributionId: "c1", shopId: "shop-1", quantity: 20, unit: "BOX" },
      { contributionId: "c2", shopId: "shop-2", quantity: 15, unit: "BOX" },
      { contributionId: "c3", shopId: "shop-3", quantity: 25, unit: "BOX" },
    ];

    it("calculates exact ₹4,800 total and correct member shares", () => {
      const result = calculatePoolPricing({ offer, contributions });

      // Total quantity: 60 boxes
      expect(result.totalEligibleQuantity).toBe(60);

      // Selected unit price: ₹80 = 8000 paise
      expect(result.appliedUnitPriceMinor).toBe(8000);

      // Group merchandise total: 480,000 paise = ₹4,800.00
      expect(result.merchandiseTotalMinor).toBe(480000);
      expect(result.groupTotalPayableMinor).toBe(480000);

      // Member 1 (20 boxes): ₹1,600 share, ₹400 savings
      const m1 = result.memberShares.find((m) => m.shopId === "shop-1");
      expect(m1.merchandiseShareMinor).toBe(160000);
      expect(m1.totalPayableMinor).toBe(160000);
      expect(m1.verifiedSavingsMinor).toBe(40000);

      // Member 2 (15 boxes): ₹1,200 share, ₹300 savings
      const m2 = result.memberShares.find((m) => m.shopId === "shop-2");
      expect(m2.merchandiseShareMinor).toBe(120000);
      expect(m2.totalPayableMinor).toBe(120000);
      expect(m2.verifiedSavingsMinor).toBe(30000);

      // Member 3 (25 boxes): ₹2,000 share, ₹500 savings
      const m3 = result.memberShares.find((m) => m.shopId === "shop-3");
      expect(m3.merchandiseShareMinor).toBe(200000);
      expect(m3.totalPayableMinor).toBe(200000);
      expect(m3.verifiedSavingsMinor).toBe(50000);

      // Total verified savings: ₹1,200 (120,000 paise)
      expect(result.verifiedSavingsTotalMinor).toBe(120000);

      // Sum of member shares equals group total
      const totalMemberShares = result.memberShares.reduce((acc, m) => acc + m.totalPayableMinor, 0);
      expect(totalMemberShares).toBe(result.groupTotalPayableMinor);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Shipping Allocation & Integer Remainder Reconciliation
  // ───────────────────────────────────────────────────────────────────────────
  describe("Shipping allocation and paise remainder reconciliation", () => {
    it("reconciles integer division remainder on final participant (EQUAL_SHARE)", () => {
      // 10,000 paise (₹100) split across 3 equal members: 3333 + 3333 + 3334
      const contributions = [{ quantity: 10 }, { quantity: 10 }, { quantity: 10 }];
      const allocation = allocateShipping(10000, contributions, "EQUAL_SHARE");

      expect(allocation.shippingStatus).toBe("KNOWN");
      expect(allocation.shippingCostMinor).toBe(10000);
      expect(allocation.shares[0].shippingShareMinor).toBe(3333);
      expect(allocation.shares[1].shippingShareMinor).toBe(3333);
      expect(allocation.shares[2].shippingShareMinor).toBe(3334);
      expect(allocation.shares[2].roundingAdjustmentMinor).toBe(1);

      const sum = allocation.shares.reduce((acc, s) => acc + s.shippingShareMinor, 0);
      expect(sum).toBe(10000);
    });

    it("allocates shipping proportionally by unit (PER_UNIT)", () => {
      // 6,000 paise (₹60) across 10, 20, 30 units (total 60): 1000 + 2000 + 3000
      const contributions = [{ quantity: 10 }, { quantity: 20 }, { quantity: 30 }];
      const allocation = allocateShipping(6000, contributions, "PER_UNIT");

      expect(allocation.shares[0].shippingShareMinor).toBe(1000);
      expect(allocation.shares[1].shippingShareMinor).toBe(2000);
      expect(allocation.shares[2].shippingShareMinor).toBe(3000);
      expect(allocation.shares[2].roundingAdjustmentMinor).toBe(0);
    });

    it("labels null shipping cost as EXCLUDED_OR_PENDING", () => {
      const contributions = [{ quantity: 10 }];
      const allocation = allocateShipping(null, contributions);

      expect(allocation.shippingStatus).toBe("EXCLUDED_OR_PENDING");
      expect(allocation.shippingCostMinor).toBeNull();
      expect(allocation.shares[0].shippingShareMinor).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Price Tier Resolution Boundaries
  // ───────────────────────────────────────────────────────────────────────────
  describe("Price Tier Resolution Boundaries", () => {
    const tiers = [
      { minQuantity: 100, maxQuantity: 499, unitPriceMinor: 9000 },
      { minQuantity: 500, maxQuantity: 999, unitPriceMinor: 8000 },
      { minQuantity: 1000, maxQuantity: null, unitPriceMinor: 7000 },
    ];
    const basePrice = 10000;

    it("falls back to base price when quantity is below lowest tier", () => {
      const res = selectPriceTier(50, tiers, basePrice);
      expect(res.appliedUnitPriceMinor).toBe(10000);
      expect(res.matchedTier).toBeNull();
    });

    it("matches exact lower bound of Tier 1", () => {
      const res = selectPriceTier(100, tiers, basePrice);
      expect(res.appliedUnitPriceMinor).toBe(9000);
    });

    it("matches middle of Tier 2", () => {
      const res = selectPriceTier(750, tiers, basePrice);
      expect(res.appliedUnitPriceMinor).toBe(8000);
    });

    it("matches open-ended highest tier (>= 1000)", () => {
      const res = selectPriceTier(2500, tiers, basePrice);
      expect(res.appliedUnitPriceMinor).toBe(7000);
    });
  });
});

