import { z } from "zod";
import { executeAIWithGuardrails } from "./aiAdapter.service.js";

/**
 * Task SAH-04: AI Requirement Extraction & Product Normalization Service
 *
 * Implements:
 * 1. extractRequirement(input, options): extracts commercial purchasing parameters
 *    from natural-language customer inquiries or OCR document text.
 * 2. normalizeProduct(description, attributes, options): transforms raw supplier/buyer
 *    descriptions into canonical catalogue product schemas.
 *
 * Enforces Zero-Hallucination & Strict Schema Constraints:
 * - "Never fabricate or guess missing quantities, certifications, or deadlines.
 *   If a field is unknown, set it to null and append its key name to uncertainFields."
 * - Full validation via Zod schemas before returning or persisting.
 */

// Zod Schema for Extracted Requirement Output
export const extractedRequirementSchema = z.object({
  productName: z.string().nullable().default(null),
  category: z.string().nullable().default(null),
  requestedQuantity: z.number().int().positive().nullable().default(null),
  quantityUnit: z.string().nullable().default(null),
  packSize: z.string().nullable().default(null),
  material: z.string().nullable().default(null),
  capacityOrSize: z.string().nullable().default(null),
  foodSafeRequired: z.boolean().nullable().default(null),
  brandConstraint: z.string().nullable().default(null),
  requiredBy: z.string().nullable().default(null),
  deliveryArea: z.string().nullable().default(null),
  uncertainFields: z.array(z.string()).default([]),
  confidenceScore: z.number().min(0).max(1).default(0.9),
  isDemoExtraction: z.boolean().optional(),
});

// Zod Schema for Normalized Product Output
export const normalizedProductSchema = z.object({
  canonicalName: z.string().min(1, "canonicalName is required"),
  category: z.string().min(1, "category is required"),
  baseUnit: z.string().min(1, "baseUnit is required"),
  packSizeDescription: z.string().min(1, "packSizeDescription is required"),
  specifications: z.object({
    material: z.string().min(1, "material is required"),
    capacityOrSize: z.string().min(1, "capacityOrSize is required"),
    foodSafe: z.boolean().default(false),
    certifications: z.array(z.string()).default([]),
    grade: z.string().default("STANDARD"),
  }),
  synonyms: z.array(z.string()).default([]),
  uncertainFields: z.array(z.string()).default([]),
  confidenceScore: z.number().min(0).max(1).default(0.95),
  isDemoExtraction: z.boolean().optional(),
});

export const EXTRACTION_SYSTEM_PROMPT = `
You are an expert commercial purchasing attribute extraction AI for Aap Ki Dukan (CoBuy AI).
Extract structured procurement fields from the provided user note or OCR document text.

[CRITICAL DIRECTIVE ON UNCERTAINTY & ZERO-HALLUCINATION]
Never fabricate, guess, or assume missing quantities, certifications, deadlines, or locations.
If an attribute is unknown, ambiguous, or not mentioned in the text, you MUST:
1. Set the field's value to null.
2. Append that exact field key name to the "uncertainFields" array.

Return ONLY a valid JSON object strictly matching this schema:
{
  "productName": string or null,
  "category": string or null (e.g. "PACKAGING", "DISPOSABLES", "BEVERAGES"),
  "requestedQuantity": positive integer or null,
  "quantityUnit": string or null (e.g. "BOX", "UNIT", "CARTON", "BAG"),
  "packSize": string or null (e.g. "1000 cups / box"),
  "material": string or null (e.g. "PE-coated paper", "Kraft corrugated"),
  "capacityOrSize": string or null (e.g. "12-oz", "8x6x3 inch"),
  "foodSafeRequired": boolean or null,
  "brandConstraint": string or null,
  "requiredBy": ISO 8601 date string or null,
  "deliveryArea": string or null (e.g. "DELHI_NCR", "LUCKNOW"),
  "uncertainFields": array of string field keys that were missing or not explicitly stated,
  "confidenceScore": number between 0.0 and 1.0
}
`.trim();

export const NORMALIZATION_SYSTEM_PROMPT = `
You are an expert product catalogue normalization AI for Aap Ki Dukan (CoBuy AI).
Normalize the provided raw product title, notes, and specifications into a canonical catalogue product definition.

[CRITICAL DIRECTIVE ON UNCERTAINTY & ZERO-HALLUCINATION]
Never fabricate or guess missing materials, certifications, or dimensions.
If an attribute cannot be determined with certainty:
1. Use standard generic values or leave certifications empty.
2. Append the attribute key name to the "uncertainFields" array.

Return ONLY a valid JSON object strictly matching this schema:
{
  "canonicalName": string,
  "category": string (e.g. "PACKAGING"),
  "baseUnit": string (e.g. "BOX", "UNIT", "CARTON", "BAG"),
  "packSizeDescription": string (e.g. "1000 cups / box"),
  "specifications": {
    "material": string,
    "capacityOrSize": string,
    "foodSafe": boolean,
    "certifications": array of strings,
    "grade": string (e.g. "STANDARD", "PREMIUM")
  },
  "synonyms": array of alternative search terms/spellings,
  "uncertainFields": array of string keys,
  "confidenceScore": number between 0.0 and 1.0
}
`.trim();

/**
 * Extracts commercial requirement fields from text or OCR input.
 *
 * @param {string|object} input - User note, transcribed invoice, or OCR text
 * @param {object} [options={}] - Tracing IDs and configuration
 * @returns {Promise<z.infer<typeof extractedRequirementSchema>>}
 */
export async function extractRequirement(input, options = {}) {
  const inputText = typeof input === "string" ? input : JSON.stringify(input);

  if (!inputText || !inputText.trim()) {
    throw new Error("Input text for requirement extraction cannot be empty.");
  }

  const rawResult = await executeAIWithGuardrails({
    operation: "EXTRACT_REQUIREMENT",
    systemPrompt: EXTRACTION_SYSTEM_PROMPT,
    untrustedInput: inputText,
    zodSchema: extractedRequirementSchema,
    correlationId: options.correlationId,
    triggeredByUserId: options.triggeredByUserId,
    requirementId: options.requirementId,
    provider: options.provider,
    model: options.model,
    timeoutMs: options.timeoutMs,
  });

  // Defensive validation: ensure any field that ended up null is reflected in uncertainFields
  const checkFields = [
    "productName",
    "category",
    "requestedQuantity",
    "quantityUnit",
    "deliveryArea",
    "material",
    "capacityOrSize",
    "packSize",
    "requiredBy",
  ];

  const uncertainSet = new Set(rawResult.uncertainFields || []);
  for (const field of checkFields) {
    if (rawResult[field] === null && !uncertainSet.has(field)) {
      uncertainSet.add(field);
    }
  }

  return {
    ...rawResult,
    uncertainFields: Array.from(uncertainSet),
  };
}

/**
 * Normalizes a raw product title and specifications into canonical catalogue attributes.
 *
 * @param {string} description - Raw product title or summary
 * @param {object} [attributes={}] - Additional vendor specs or attributes
 * @param {object} [options={}] - Tracing IDs and configuration
 * @returns {Promise<z.infer<typeof normalizedProductSchema>>}
 */
export async function normalizeProduct(description, attributes = {}, options = {}) {
  const rawInput = `${description || ""}\n\nAttributes: ${JSON.stringify(attributes)}`;

  if (!rawInput.trim()) {
    throw new Error("Product description for normalization cannot be empty.");
  }

  return executeAIWithGuardrails({
    operation: "NORMALIZE_PRODUCT",
    systemPrompt: NORMALIZATION_SYSTEM_PROMPT,
    untrustedInput: rawInput,
    zodSchema: normalizedProductSchema,
    correlationId: options.correlationId,
    triggeredByUserId: options.triggeredByUserId,
    provider: options.provider,
    model: options.model,
    timeoutMs: options.timeoutMs,
  });
}

export default {
  extractedRequirementSchema,
  normalizedProductSchema,
  EXTRACTION_SYSTEM_PROMPT,
  NORMALIZATION_SYSTEM_PROMPT,
  extractRequirement,
  normalizeProduct,
};
