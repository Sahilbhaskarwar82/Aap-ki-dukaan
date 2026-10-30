import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import {
  extractedRequirementSchema,
  normalizedProductSchema,
  extractRequirement,
  normalizeProduct,
  EXTRACTION_SYSTEM_PROMPT,
  NORMALIZATION_SYSTEM_PROMPT,
} from "../../src/services/ai/extraction.service.js";
import { AIExecutionLog } from "../../src/models/AIExecutionLog.model.js";

let mongoServer;

describe("AI Requirement Extraction & Product Normalization Service Unit Tests (SAH-04)", () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await AIExecutionLog.deleteMany({});
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Zod Schema Validation Contract
  // ───────────────────────────────────────────────────────────────────────────
  describe("Zod Extraction Schema Contract (extractedRequirementSchema)", () => {
    it("validates a fully populated valid requirement extraction payload", () => {
      const validPayload = {
        productName: "12-oz Food-Safe Paper Cups",
        category: "PACKAGING",
        requestedQuantity: 25,
        quantityUnit: "BOX",
        packSize: "1000 cups / box",
        material: "Food-grade PE-coated paper",
        capacityOrSize: "12-oz (350ml)",
        foodSafeRequired: true,
        brandConstraint: null,
        requiredBy: "2026-11-15T00:00:00.000Z",
        deliveryArea: "LUCKNOW",
        uncertainFields: [],
        confidenceScore: 0.94,
        isDemoExtraction: true,
      };

      const parsed = extractedRequirementSchema.safeParse(validPayload);
      expect(parsed.success).toBe(true);
      expect(parsed.data.productName).toBe("12-oz Food-Safe Paper Cups");
      expect(parsed.data.requestedQuantity).toBe(25);
    });

    it("accepts null for unknown fields and verifies tracking in uncertainFields", () => {
      const partialPayload = {
        productName: "Generic Plastic Containers",
        category: null,
        requestedQuantity: null,
        quantityUnit: null,
        packSize: null,
        material: "Polypropylene",
        capacityOrSize: null,
        foodSafeRequired: null,
        brandConstraint: null,
        requiredBy: null,
        deliveryArea: null,
        uncertainFields: [
          "category",
          "requestedQuantity",
          "quantityUnit",
          "deliveryArea",
          "foodSafeRequired",
        ],
        confidenceScore: 0.72,
      };

      const parsed = extractedRequirementSchema.safeParse(partialPayload);
      expect(parsed.success).toBe(true);
      expect(parsed.data.category).toBeNull();
      expect(parsed.data.requestedQuantity).toBeNull();
      expect(parsed.data.uncertainFields).toContain("requestedQuantity");
      expect(parsed.data.uncertainFields).toContain("deliveryArea");
    });

    it("rejects non-positive integer requestedQuantity (e.g. -5 or decimals 12.5)", () => {
      const negativeQty = {
        productName: "Cups",
        requestedQuantity: -5,
        confidenceScore: 0.9,
      };
      expect(extractedRequirementSchema.safeParse(negativeQty).success).toBe(false);

      const decimalQty = {
        productName: "Cups",
        requestedQuantity: 12.5,
        confidenceScore: 0.9,
      };
      expect(extractedRequirementSchema.safeParse(decimalQty).success).toBe(false);
    });

    it("rejects confidenceScore outside [0, 1] range", () => {
      const invalidScore = {
        productName: "Cups",
        confidenceScore: 1.5,
      };
      expect(extractedRequirementSchema.safeParse(invalidScore).success).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. extractRequirement Function & Prompt Constraints
  // ───────────────────────────────────────────────────────────────────────────
  describe("extractRequirement(input)", () => {
    it("successfully extracts requirements from commercial text in mock/deterministic mode", async () => {
      const inputText =
        "We need 25 boxes of 12-ounce food-safe paper cups for our café in Lucknow within two weeks";

      const result = await extractRequirement(inputText, {
        provider: "mock",
      });

      expect(result).toBeDefined();
      expect(result.productName).toContain("12-oz");
      expect(result.category).toBe("PACKAGING");
      expect(result.requestedQuantity).toBe(25);
      expect(result.quantityUnit).toBe("BOX");
      expect(result.isDemoExtraction).toBe(true);
      expect(Array.isArray(result.uncertainFields)).toBe(true);

      // Verify AIExecutionLog in MongoDB
      const log = await AIExecutionLog.findOne({ operation: "EXTRACT_REQUIREMENT" });
      expect(log).not.toBeNull();
      expect(log.status).toBe("SUCCESS");
      expect(log.schemaValidated).toBe(true);
    });

    it("verifies system prompt explicitly commands zero-hallucination and uncertainFields tracking", () => {
      expect(EXTRACTION_SYSTEM_PROMPT).toContain("Never fabricate, guess, or assume");
      expect(EXTRACTION_SYSTEM_PROMPT).toContain('"uncertainFields"');
      expect(EXTRACTION_SYSTEM_PROMPT).toContain("null");
    });

    it("rejects empty input text with clear Error", async () => {
      await expect(extractRequirement("   ")).rejects.toThrow(/cannot be empty/i);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. normalizeProduct Function & Prompt Constraints
  // ───────────────────────────────────────────────────────────────────────────
  describe("normalizeProduct(description, attributes)", () => {
    it("normalizes raw product text into canonical catalogue structure", async () => {
      const description = "Disposable hot coffee & tea paper cups 12 oz capacity";
      const attributes = { packaging: "Carton of 1000", lining: "Polyethylene" };

      const result = await normalizeProduct(description, attributes, {
        provider: "mock",
      });

      expect(result).toBeDefined();
      expect(result.canonicalName).toContain("12-oz");
      expect(result.baseUnit).toBe("BOX");
      expect(result.specifications.material).toBeDefined();
      expect(result.specifications.foodSafe).toBe(true);
      expect(result.isDemoExtraction).toBe(true);

      // Verify log entry
      const log = await AIExecutionLog.findOne({ operation: "NORMALIZE_PRODUCT" });
      expect(log).not.toBeNull();
      expect(log.status).toBe("SUCCESS");
    });

    it("verifies normalization prompt contains zero-hallucination directives", () => {
      expect(NORMALIZATION_SYSTEM_PROMPT).toContain("Never fabricate or guess");
      expect(NORMALIZATION_SYSTEM_PROMPT).toContain('"uncertainFields"');
    });

    it("rejects empty product description", async () => {
      await expect(normalizeProduct("", {})).rejects.toThrow(/cannot be empty/i);
    });
  });
});
