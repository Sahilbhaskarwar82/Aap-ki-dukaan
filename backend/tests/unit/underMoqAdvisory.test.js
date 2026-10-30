import { describe, it, expect } from "vitest";
import {
  underMoqAdvisorySchema,
  buildUnderMoqSystemPrompt,
  generateDeterministicUnderMoqAdvisory,
  recommendUnderMOQAction,
} from "../../src/services/ai/advisory.service.js";

describe("AI Under-MOQ Advisory Generator Unit Tests (SAH-08)", () => {
  const basePoolContext = {
    title: "12-oz Food-Safe PE-Lined Paper Cups",
    targetMoq: 1000,
    achievedQuantity: 600,
    currentUnitPriceMinor: 8000, // ₹80.00 in minor units
    currency: "INR",
    supplierUnderMoqStatus: "AWAITING_SUPPLIER",
    supplierAcceptsUnderMoq: false,
  };

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Output Schema Validation (Zod Contract)
  // ───────────────────────────────────────────────────────────────────────────
  describe("Zod Schema Structure & Output Contract", () => {
    it("validates that advisory output strictly matches the required schema", async () => {
      const result = await recommendUnderMOQAction(basePoolContext, []);

      // Validate schema parsing does not throw
      const parsed = underMoqAdvisorySchema.safeParse(result);
      expect(parsed.success).toBe(true);

      // Verify exact required fields
      expect(["PROCEED", "WAIT_FOR_REVISED_QUOTE", "CANCEL"]).toContain(result.suggestedAction);
      expect(typeof result.explanation).toBe("string");
      expect(result.explanation.length).toBeGreaterThan(10);
      expect(typeof result.supportingFigures).toBe("object");
      expect(Array.isArray(result.uncertainties)).toBe(true);

      // Check numeric figures
      expect(result.supportingFigures.achievedQuantity).toBe(600);
      expect(result.supportingFigures.targetMoq).toBe(1000);
      expect(result.supportingFigures.shortfall).toBe(400);
      expect(result.supportingFigures.achievementPercentage).toBe(60);
    });

    it("rejects invalid suggestedAction not in enum", () => {
      const invalidData = {
        suggestedAction: "INVALID_ACTION",
        explanation: "Some explanation here that is long enough",
        supportingFigures: { achievedQuantity: 50, targetMoq: 100, shortfall: 50, achievementPercentage: 50 },
        uncertainties: [],
      };

      const parsed = underMoqAdvisorySchema.safeParse(invalidData);
      expect(parsed.success).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Decision Logic & Rule Grounding
  // ───────────────────────────────────────────────────────────────────────────
  describe("Grounded Decision Advisory Logic", () => {
    it("recommends PROCEED when the wholesaler accepts sub-MOQ orders", async () => {
      const subMoqAcceptedContext = {
        ...basePoolContext,
        supplierAcceptsUnderMoq: true,
        supplierUnderMoqStatus: "ACCEPTED_SUB_MOQ",
      };

      const result = await recommendUnderMOQAction(subMoqAcceptedContext);
      expect(result.suggestedAction).toBe("PROCEED");
      expect(result.explanation).toMatch(/willingness to fulfill|sub-MOQ/i);
    });

    it("recommends PROCEED when compatible alternative supplier offers exist", async () => {
      const alternativeOffers = [
        {
          _id: "alt_offer_01",
          supplierId: "supplier_alt",
          baseUnitPriceMinor: 8500, // ₹85.00
          minimumOrderQuantity: 500,
        },
      ];

      const result = await recommendUnderMOQAction(basePoolContext, alternativeOffers);
      expect(result.suggestedAction).toBe("PROCEED");
      expect(result.explanation).toMatch(/alternative compatible supplier/i);
      expect(result.supportingFigures.alternativeOffersAvailable).toBe(1);
    });

    it("recommends WAIT_FOR_REVISED_QUOTE when pool achieved >= 50% and quote revision is pending", async () => {
      const result = await recommendUnderMOQAction(basePoolContext, []);
      expect(result.suggestedAction).toBe("WAIT_FOR_REVISED_QUOTE");
      expect(result.explanation).toMatch(/revised/i);
      expect(result.supportingFigures.achievementPercentage).toBe(60);
    });

    it("recommends CANCEL when achieved quantity is critically below MOQ (< 50%) with no alternatives", async () => {
      const lowQuantityContext = {
        ...basePoolContext,
        achievedQuantity: 200, // 20% of 1000
        supplierUnderMoqStatus: "REJECTED_SUB_MOQ",
        supplierAcceptsUnderMoq: false,
      };

      const result = await recommendUnderMOQAction(lowQuantityContext, []);
      expect(result.suggestedAction).toBe("CANCEL");
      expect(result.explanation).toMatch(/protects buyer capital|refund/i);
      expect(result.supportingFigures.achievementPercentage).toBe(20);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. System Prompt Structure & Grounding Constraints
  // ───────────────────────────────────────────────────────────────────────────
  describe("System Prompt Structure (buildUnderMoqSystemPrompt)", () => {
    it("generates system prompt containing verified figures and zero-hallucination constraint", () => {
      const prompt = buildUnderMoqSystemPrompt(basePoolContext, []);

      expect(prompt).toContain("Target MOQ (MOQ_W): 1000");
      expect(prompt).toContain("Achieved Pool Quantity (Q_pool): 600");
      expect(prompt).toContain("Shortfall: 400");
      expect(prompt).toContain("DO NOT invent or assume supplier willingness");
      expect(prompt).toContain('"suggestedAction": "PROCEED" | "WAIT_FOR_REVISED_QUOTE" | "CANCEL"');
    });
  });
});

