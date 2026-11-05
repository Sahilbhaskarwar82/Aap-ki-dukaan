import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import {
  validateRuleBR001,
  confirmRequirement,
  rejectRequirement,
} from "../../src/controllers/requirement.controller.js";
import { Requirement } from "../../src/models/Requirement.model.js";

// Helper to wait for asyncHandler which doesn't await the inner promise
function runHandler(handler, req, res) {
  return new Promise((resolve, reject) => {
    const wrappedRes = {
      ...res,
      status: (code) => {
        if (res.status) res.status(code);
        return wrappedRes;
      },
      json: (payload) => {
        if (res.json) res.json(payload);
        resolve({ type: "json", payload });
        return wrappedRes;
      },
    };
    const next = (err) => {
      if (err) resolve({ type: "error", error: err });
      else resolve({ type: "next" });
    };

    handler(req, wrappedRes, next).catch(reject);
  });
}

describe("Requirement Confirm and Reject Actions Unit Tests (SAH-02)", () => {
  const dummyShopId = new mongoose.Types.ObjectId();
  const dummyUserId = new mongoose.Types.ObjectId();
  const validRequirementId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Rule BR-001 Validation", () => {
    it("passes when all 5 mandatory fields are valid", () => {
      const validFields = {
        productName: "12-oz Paper Coffee Cups",
        category: "PACKAGING",
        requestedQuantity: 25,
        quantityUnit: "BOX",
        deliveryArea: "LUCKNOW",
      };

      expect(() => validateRuleBR001(validFields)).not.toThrow();
    });

    it("throws 400 when productName is missing or empty", () => {
      const invalidFields = {
        productName: "   ",
        category: "PACKAGING",
        requestedQuantity: 25,
        quantityUnit: "BOX",
        deliveryArea: "LUCKNOW",
      };

      expect(() => validateRuleBR001(invalidFields)).toThrowError(
        /BR-001 Validation Failed/
      );
    });

    it("throws 400 when category is missing", () => {
      const invalidFields = {
        productName: "12-oz Cups",
        category: "",
        requestedQuantity: 25,
        quantityUnit: "BOX",
        deliveryArea: "LUCKNOW",
      };

      expect(() => validateRuleBR001(invalidFields)).toThrowError(
        /BR-001 Validation Failed/
      );
    });

    it("throws 400 when requestedQuantity is non-integer or <= 0", () => {
      expect(() =>
        validateRuleBR001({
          productName: "12-oz Cups",
          category: "PACKAGING",
          requestedQuantity: 0,
          quantityUnit: "BOX",
          deliveryArea: "LUCKNOW",
        })
      ).toThrowError(/BR-001 Validation Failed/);

      expect(() =>
        validateRuleBR001({
          productName: "12-oz Cups",
          category: "PACKAGING",
          requestedQuantity: 5.5,
          quantityUnit: "BOX",
          deliveryArea: "LUCKNOW",
        })
      ).toThrowError(/BR-001 Validation Failed/);
    });

    it("throws 400 when quantityUnit or deliveryArea is missing", () => {
      expect(() =>
        validateRuleBR001({
          productName: "12-oz Cups",
          category: "PACKAGING",
          requestedQuantity: 10,
          quantityUnit: "",
          deliveryArea: "LUCKNOW",
        })
      ).toThrowError(/BR-001 Validation Failed/);

      expect(() =>
        validateRuleBR001({
          productName: "12-oz Cups",
          category: "PACKAGING",
          requestedQuantity: 10,
          quantityUnit: "BOX",
          deliveryArea: "  ",
        })
      ).toThrowError(/BR-001 Validation Failed/);
    });
  });

  describe("confirmRequirement Controller Method", () => {
    it("successfully confirms a draft requirement with valid fields and sets status=CONFIRMED", async () => {
      const mockDoc = {
        _id: validRequirementId,
        shopId: dummyShopId,
        createdByUserId: dummyUserId,
        status: "DRAFT",
        confirmedFields: {},
        save: vi.fn().mockResolvedValue(true),
      };

      vi.spyOn(Requirement, "findById").mockResolvedValue(mockDoc);

      const req = {
        params: { id: validRequirementId.toString() },
        body: {
          confirmedFields: {
            productName: "Grade A Cardamom 8mm",
            category: "SPICES",
            requestedQuantity: 10,
            quantityUnit: "KG",
            deliveryArea: "DELHI_NCR",
          },
        },
        user: { _id: dummyUserId, role: "SHOP_OWNER" },
        shop: { _id: dummyShopId },
      };

      let statusCodeResult;
      const res = {
        status: (code) => {
          statusCodeResult = code;
          return res;
        },
        json: (payload) => payload,
      };

      const result = await runHandler(confirmRequirement, req, res);

      expect(result.type).toBe("json");
      expect(statusCodeResult).toBe(200);
      expect(mockDoc.status).toBe("CONFIRMED");
      expect(mockDoc.productName).toBe("Grade A Cardamom 8mm");
      expect(mockDoc.category).toBe("SPICES");
      expect(mockDoc.requestedQuantity).toBe(10);
      expect(mockDoc.quantityUnit).toBe("KG");
      expect(mockDoc.deliveryArea).toBe("DELHI_NCR");
      expect(mockDoc.confirmedAt).toBeInstanceOf(Date);
      expect(mockDoc.save).toHaveBeenCalled();
    });

    it("rejects confirmation if mandatory BR-001 fields are missing", async () => {
      const mockDoc = {
        _id: validRequirementId,
        shopId: dummyShopId,
        status: "DRAFT",
        confirmedFields: {},
        save: vi.fn(),
      };

      vi.spyOn(Requirement, "findById").mockResolvedValue(mockDoc);

      const req = {
        params: { id: validRequirementId.toString() },
        body: {
          confirmedFields: {
            productName: "Incomplete Item",
          },
        },
        user: { _id: dummyUserId, role: "SHOP_OWNER" },
        shop: { _id: dummyShopId },
      };

      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };

      const result = await runHandler(confirmRequirement, req, res);

      expect(result.type).toBe("error");
      expect(result.error.message).toMatch(/BR-001 Validation Failed/);
      expect(mockDoc.save).not.toHaveBeenCalled();
    });

    it("rejects if shop owner attempts to confirm another shop's requirement (403)", async () => {
      const otherShopId = new mongoose.Types.ObjectId();
      const mockDoc = {
        _id: validRequirementId,
        shopId: otherShopId,
        status: "DRAFT",
        confirmedFields: {},
        save: vi.fn(),
      };

      vi.spyOn(Requirement, "findById").mockResolvedValue(mockDoc);

      const req = {
        params: { id: validRequirementId.toString() },
        body: { confirmedFields: {} },
        user: { _id: dummyUserId, role: "SHOP_OWNER" },
        shop: { _id: dummyShopId }, // Different shop
      };

      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };

      const result = await runHandler(confirmRequirement, req, res);

      expect(result.type).toBe("error");
      expect(result.error.message).toMatch(/Access denied/);
      expect(result.error.statusCode).toBe(403);
    });
  });

  describe("rejectRequirement Controller Method", () => {
    it("successfully sets requirement status to REJECTED", async () => {
      const mockDoc = {
        _id: validRequirementId,
        shopId: dummyShopId,
        status: "DRAFT",
        save: vi.fn().mockResolvedValue(true),
      };

      vi.spyOn(Requirement, "findById").mockResolvedValue(mockDoc);

      const req = {
        params: { id: validRequirementId.toString() },
        body: {},
        user: { _id: dummyUserId, role: "SHOP_OWNER" },
        shop: { _id: dummyShopId },
      };

      let statusCodeResult;
      const res = {
        status: (code) => {
          statusCodeResult = code;
          return res;
        },
        json: (payload) => payload,
      };

      const result = await runHandler(rejectRequirement, req, res);

      expect(result.type).toBe("json");
      expect(statusCodeResult).toBe(200);
      expect(mockDoc.status).toBe("REJECTED");
      expect(mockDoc.save).toHaveBeenCalled();
    });

    it("prevents rejecting an already-confirmed requirement (409)", async () => {
      const mockDoc = {
        _id: validRequirementId,
        shopId: dummyShopId,
        status: "CONFIRMED",
        save: vi.fn(),
      };

      vi.spyOn(Requirement, "findById").mockResolvedValue(mockDoc);

      const req = {
        params: { id: validRequirementId.toString() },
        body: {},
        user: { _id: dummyUserId, role: "SHOP_OWNER" },
        shop: { _id: dummyShopId },
      };

      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };

      const result = await runHandler(rejectRequirement, req, res);

      expect(result.type).toBe("error");
      expect(result.error.message).toMatch(
        /Cannot reject a requirement that has already been confirmed/
      );
      expect(result.error.statusCode).toBe(409);
      expect(mockDoc.save).not.toHaveBeenCalled();
    });
  });
});
