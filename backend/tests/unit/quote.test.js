import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { Quote, QUOTE_STATUSES, QUOTE_REQUEST_REASONS, QUOTE_SOURCES } from "../../src/models/Quote.model.js";

describe("Quote Model & Business Rules Unit Tests (SAH-09)", () => {
  const dummySupplierId = new mongoose.Types.ObjectId();
  const dummyProductId = new mongoose.Types.ObjectId();
  const dummyUserId = new mongoose.Types.ObjectId();
  const dummyShopId = new mongoose.Types.ObjectId();

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Schema Contract & Validation Constraints
  // ───────────────────────────────────────────────────────────────────────────
  describe("Quote Model Schema Validation", () => {
    it("validates a well-formed quote request document", async () => {
      const quote = new Quote({
        supplierId: dummySupplierId,
        productId: dummyProductId,
        requestedByUserId: dummyUserId,
        shopId: dummyShopId,
        requestedQuantity: 50,
        deliveryArea: "DELHI_NCR",
        requestReason: "UNDER_MOQ_POOL",
        requestNotes: "Need revised terms for 50 boxes.",
      });

      const err = quote.validateSync();
      expect(err).toBeUndefined();
      expect(quote.status).toBe("REQUESTED");
      expect(quote.currency).toBe("INR");
      expect(quote.source).toBe("BUYER_REQUEST");
    });

    it("requires supplierId, productId, requestedByUserId, requestedQuantity, and deliveryArea", () => {
      const emptyQuote = new Quote({});
      const err = emptyQuote.validateSync();

      expect(err).toBeDefined();
      expect(err.errors.supplierId).toBeDefined();
      expect(err.errors.productId).toBeDefined();
      expect(err.errors.requestedByUserId).toBeDefined();
      expect(err.errors.requestedQuantity).toBeDefined();
      expect(err.errors.deliveryArea).toBeDefined();
    });

    it("rejects non-positive requestedQuantity (<= 0)", () => {
      const zeroQtyQuote = new Quote({
        supplierId: dummySupplierId,
        productId: dummyProductId,
        requestedByUserId: dummyUserId,
        requestedQuantity: 0,
        deliveryArea: "DELHI_NCR",
      });

      const err = zeroQtyQuote.validateSync();
      expect(err).toBeDefined();
      expect(err.errors.requestedQuantity).toBeDefined();
    });

    it("enforces allowed status enums", () => {
      const quote = new Quote({
        supplierId: dummySupplierId,
        productId: dummyProductId,
        requestedByUserId: dummyUserId,
        requestedQuantity: 10,
        deliveryArea: "DELHI_NCR",
        status: "INVALID_STATUS",
      });

      const err = quote.validateSync();
      expect(err).toBeDefined();
      expect(err.errors.status).toBeDefined();
    });

    it("verifies all standard QUOTE_STATUSES and QUOTE_REQUEST_REASONS are defined", () => {
      expect(QUOTE_STATUSES).toEqual([
        "REQUESTED",
        "PROVIDED",
        "ACCEPTED",
        "EXPIRED",
        "REJECTED",
      ]);

      expect(QUOTE_REQUEST_REASONS).toContain("NO_COMPATIBLE_OFFER");
      expect(QUOTE_REQUEST_REASONS).toContain("UNDER_MOQ_POOL");
      expect(QUOTE_REQUEST_REASONS).toContain("STALE_QUOTE");
      expect(QUOTE_SOURCES).toContain("BUYER_REQUEST");
      expect(QUOTE_SOURCES).toContain("UNDER_MOQ_AUTO_TRIGGER");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Financial Precision & Integer Minor Units
  // ───────────────────────────────────────────────────────────────────────────
  describe("Financial Integrity & Minor Unit Arithmetic", () => {
    it("accepts valid unitPriceMinor and calculates landedCostMinor correctly", () => {
      const quote = new Quote({
        supplierId: dummySupplierId,
        productId: dummyProductId,
        requestedByUserId: dummyUserId,
        requestedQuantity: 25,
        deliveryArea: "DELHI_NCR",
        unitPriceMinor: 8000, // ₹80.00
        shippingCostMinor: 50000, // ₹500.00
        status: "PROVIDED",
      });

      const err = quote.validateSync();
      expect(err).toBeUndefined();

      // Landed cost = (25 * 8000) + 50000 = 200,000 + 50,000 = 250,000 paise (₹2,500.00)
      expect(quote.landedCostMinor).toBe(250000);
    });

    it("returns null for landedCostMinor when unitPriceMinor is not yet set", () => {
      const quote = new Quote({
        supplierId: dummySupplierId,
        productId: dummyProductId,
        requestedByUserId: dummyUserId,
        requestedQuantity: 25,
        deliveryArea: "DELHI_NCR",
        unitPriceMinor: null,
      });

      expect(quote.landedCostMinor).toBeNull();
    });

    it("rejects negative shippingCostMinor", () => {
      const quote = new Quote({
        supplierId: dummySupplierId,
        productId: dummyProductId,
        requestedByUserId: dummyUserId,
        requestedQuantity: 10,
        deliveryArea: "DELHI_NCR",
        shippingCostMinor: -500,
      });

      const err = quote.validateSync();
      expect(err).toBeDefined();
      expect(err.errors.shippingCostMinor).toBeDefined();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Expiration & Validity Timestamps
  // ───────────────────────────────────────────────────────────────────────────
  describe("Quote Expiration Evaluation (isExpired Virtual)", () => {
    it("evaluates isExpired as false when validUntil is in the future", () => {
      const quote = new Quote({
        supplierId: dummySupplierId,
        productId: dummyProductId,
        requestedByUserId: dummyUserId,
        requestedQuantity: 10,
        deliveryArea: "DELHI_NCR",
        status: "PROVIDED",
        validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
      });

      expect(quote.isExpired).toBe(false);
    });

    it("evaluates isExpired as true when validUntil is in the past", () => {
      const quote = new Quote({
        supplierId: dummySupplierId,
        productId: dummyProductId,
        requestedByUserId: dummyUserId,
        requestedQuantity: 10,
        deliveryArea: "DELHI_NCR",
        status: "PROVIDED",
        validUntil: new Date(Date.now() - 1000), // 1 second ago
      });

      expect(quote.isExpired).toBe(true);
    });

    it("evaluates isExpired as true when status is explicitly EXPIRED", () => {
      const quote = new Quote({
        supplierId: dummySupplierId,
        productId: dummyProductId,
        requestedByUserId: dummyUserId,
        requestedQuantity: 10,
        deliveryArea: "DELHI_NCR",
        status: "EXPIRED",
      });

      expect(quote.isExpired).toBe(true);
    });

    it("evaluates isExpired as false when validUntil is null/unspecified and status is REQUESTED", () => {
      const quote = new Quote({
        supplierId: dummySupplierId,
        productId: dummyProductId,
        requestedByUserId: dummyUserId,
        requestedQuantity: 10,
        deliveryArea: "DELHI_NCR",
        status: "REQUESTED",
        validUntil: null,
      });

      expect(quote.isExpired).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Sub-MOQ Feasibility Terms Structure
  // ───────────────────────────────────────────────────────────────────────────
  describe("Sub-MOQ Terms Schema Integrity", () => {
    it("stores sub-MOQ acceptance, minimum batch, and surcharge", () => {
      const quote = new Quote({
        supplierId: dummySupplierId,
        productId: dummyProductId,
        requestedByUserId: dummyUserId,
        requestedQuantity: 30,
        deliveryArea: "DELHI_NCR",
        subMoqTerms: {
          acceptsSubMoq: true,
          minSubMoqQuantity: 20,
          surchargeMinor: 1500, // ₹15.00 handling surcharge
          supplierNotes: "Accepted with sub-MOQ freight adjustment.",
        },
      });

      const err = quote.validateSync();
      expect(err).toBeUndefined();
      expect(quote.subMoqTerms.acceptsSubMoq).toBe(true);
      expect(quote.subMoqTerms.minSubMoqQuantity).toBe(20);
      expect(quote.subMoqTerms.surchargeMinor).toBe(1500);
      expect(quote.subMoqTerms.supplierNotes).toBe("Accepted with sub-MOQ freight adjustment.");
    });
  });
});
