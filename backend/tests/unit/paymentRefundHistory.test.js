import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import { listPayments, captureOrder } from "../../src/controllers/payment.controller.js";
import { listRefunds } from "../../src/controllers/refund.controller.js";
import * as paymentService from "../../src/services/payments/payment.service.js";
import * as refundService from "../../src/services/refunds/refund.service.js";

describe("Payment & Refund History API Controllers (Unit Tests)", () => {
  let mockRes;
  let mockNext;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();

    // Default spies on service methods
    vi.spyOn(paymentService, "listPaymentsForShop").mockResolvedValue({
      payments: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    vi.spyOn(refundService, "listRefundsForShop").mockResolvedValue({
      refunds: [],
      total: 0,
      page: 1,
      limit: 20,
    });

    // Mock Shop model if accessed
    const mockShopModel = {
      findOne: vi.fn().mockResolvedValue(null),
    };
    vi.spyOn(mongoose, "model").mockReturnValue(mockShopModel);
    if (!mongoose.models.Shop) {
      mongoose.models.Shop = mockShopModel;
    } else {
      vi.spyOn(mongoose.models.Shop, "findOne").mockResolvedValue(null);
    }
  });

  describe("listPayments controller", () => {
    it("delegates 401 error to next() when request is unauthenticated (no req.user)", async () => {
      const req = { user: null, query: {} };
      await listPayments(req, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          message: expect.stringMatching(/Authentication required to view payment history/i),
        })
      );
    });

    it("returns 200 with empty list when SHOP_OWNER has no shop profile associated and no payments", async () => {
      const req = {
        user: { _id: "usr_no_shop", role: "SHOP_OWNER" },
        shop: null,
        query: { page: 1, limit: 20 },
      };

      await listPayments(req, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(paymentService.listPaymentsForShop).toHaveBeenCalledWith(null, {
        page: 1,
        limit: 20,
        payerUserId: "usr_no_shop",
        providerCaptureId: undefined,
      });
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 200,
          data: expect.objectContaining({
            payments: [],
            total: 0,
          }),
        })
      );
    });

    it("retrieves payments for authenticated SHOP_OWNER via listPaymentsForShop", async () => {
      const mockResult = {
        payments: [
          {
            _id: "pay_001",
            amountMinor: 480000,
            currency: "INR",
            paymentStatus: "PAID",
            providerOrderId: "ORDER_001",
            providerCaptureId: "CAP_001",
            poolId: { title: "Paper Cups Pool" },
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      };

      vi.spyOn(paymentService, "listPaymentsForShop").mockResolvedValue(mockResult);

      const req = {
        user: { _id: "usr_shop_b", role: "SHOP_OWNER" },
        shop: { _id: "shop_b" },
        query: { page: "1", limit: "20" },
      };

      await listPayments(req, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(paymentService.listPaymentsForShop).toHaveBeenCalledWith("shop_b", {
        page: "1",
        limit: "20",
        payerUserId: "usr_shop_b",
        providerCaptureId: undefined,
      });
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 200,
          data: mockResult,
        })
      );
    });

    it("allows filtering and lookup by providerCaptureId (e.g. 39H31017FP952771S)", async () => {
      const targetCaptureId = "39H31017FP952771S";
      const mockResult = {
        payments: [
          {
            _id: "pay_cups_01",
            amountMinor: 160000,
            currency: "INR",
            paymentStatus: "PAID",
            providerOrderId: "ORDER_CUPS_01",
            providerCaptureId: targetCaptureId,
            poolId: { title: "12oz Eco Kraft Paper Cups (Carton of 1,000)" },
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      };

      vi.spyOn(paymentService, "listPaymentsForShop").mockResolvedValue(mockResult);

      const req = {
        user: { _id: "usr_shop_a", role: "SHOP_OWNER" },
        shop: { _id: "shop_a" },
        query: { providerCaptureId: targetCaptureId },
      };

      await listPayments(req, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(paymentService.listPaymentsForShop).toHaveBeenCalledWith("shop_a", {
        page: undefined,
        limit: undefined,
        payerUserId: "usr_shop_a",
        providerCaptureId: targetCaptureId,
      });
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            payments: expect.arrayContaining([
              expect.objectContaining({ providerCaptureId: targetCaptureId }),
            ]),
          }),
        })
      );
    });

    it("strictly isolates retailers: shop A cannot see shop B payments", async () => {
      const req = {
        user: { _id: "usr_shop_a", role: "SHOP_OWNER" },
        shop: { _id: "shop_a" },
        query: { shopId: "shop_b" }, // Malicious attempt to query another shop's ID
      };

      await listPayments(req, mockRes, mockNext);

      // The controller must enforce req.shop._id ("shop_a") and ignore query.shopId
      expect(paymentService.listPaymentsForShop).toHaveBeenCalledWith("shop_a", expect.objectContaining({
        payerUserId: "usr_shop_a",
      }));
    });

    it("allows ADMIN to retrieve all payments without 403 error", async () => {
      const mockResult = {
        payments: [
          { _id: "pay_admin_1", amountMinor: 50000, paymentStatus: "PAID" },
        ],
        total: 1,
        page: 1,
        limit: 20,
      };

      vi.spyOn(paymentService, "listPaymentsForShop").mockResolvedValue(mockResult);

      const req = {
        user: { _id: "admin_1", role: "ADMIN" },
        shop: null,
        query: {},
      };

      await listPayments(req, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(paymentService.listPaymentsForShop).toHaveBeenCalledWith(null, {
        page: undefined,
        limit: undefined,
        isAdmin: true,
      });
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });
  });

  describe("captureOrder controller", () => {
    it("passes providerCaptureId from request body to capturePaymentOrder", async () => {
      const mockCaptureResult = {
        payment: {
          _id: "pay_captured_1",
          paymentStatus: "PAID",
          providerOrderId: "ORDER_P_1",
          providerCaptureId: "39H31017FP952771S",
        },
        contribution: { _id: "contrib_1", state: "ACTIVE" },
        isDuplicate: false,
      };

      vi.spyOn(paymentService, "capturePaymentOrder").mockResolvedValue(mockCaptureResult);

      const req = {
        params: { paymentId: "pay_captured_1" },
        body: {
          providerOrderId: "ORDER_P_1",
          providerCaptureId: "39H31017FP952771S",
        },
        user: { _id: "usr_buyer_1" },
      };

      await captureOrder(req, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(paymentService.capturePaymentOrder).toHaveBeenCalledWith({
        paymentId: "pay_captured_1",
        providerOrderId: "ORDER_P_1",
        providerCaptureId: "39H31017FP952771S",
        captureRequesterId: "usr_buyer_1",
      });
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 200,
          data: expect.objectContaining({
            payment: expect.objectContaining({
              providerCaptureId: "39H31017FP952771S",
              paymentStatus: "PAID",
            }),
          }),
        })
      );
    });
  });

  describe("listRefunds controller", () => {
    it("delegates 401 error to next() when unauthenticated", async () => {
      const req = { user: null, query: {} };
      await listRefunds(req, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          message: expect.stringMatching(/Authentication required to view refund history/i),
        })
      );
    });

    it("returns 200 with empty list when SHOP_OWNER has no shop profile associated and no refunds", async () => {
      const req = {
        user: { _id: "usr_no_shop", role: "SHOP_OWNER" },
        shop: null,
        query: { page: 1, limit: 20 },
      };

      await listRefunds(req, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(refundService.listRefundsForShop).toHaveBeenCalledWith(null, {
        page: 1,
        limit: 20,
        recipientUserId: "usr_no_shop",
      });
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 200,
          data: expect.objectContaining({
            refunds: [],
            total: 0,
          }),
        })
      );
    });

    it("retrieves refunds for authenticated SHOP_OWNER via listRefundsForShop", async () => {
      const mockResult = {
        refunds: [
          {
            _id: "ref_001",
            amountMinor: 28000,
            currency: "INR",
            reason: "TIER_PRICE_DROP_SAVINGS",
            status: "COMPLETED",
            providerRefundId: "MOCK_REF_123",
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      };

      vi.spyOn(refundService, "listRefundsForShop").mockResolvedValue(mockResult);

      const req = {
        user: { _id: "usr_shop_b", role: "SHOP_OWNER" },
        shop: { _id: "shop_b" },
        query: { page: "1", limit: "20" },
      };

      await listRefunds(req, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(refundService.listRefundsForShop).toHaveBeenCalledWith("shop_b", {
        page: "1",
        limit: "20",
        recipientUserId: "usr_shop_b",
      });
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 200,
          data: mockResult,
        })
      );
    });

    it("allows ADMIN to view all refunds without 403 error", async () => {
      const mockResult = {
        refunds: [],
        total: 0,
        page: 1,
        limit: 20,
      };

      vi.spyOn(refundService, "listRefundsForShop").mockResolvedValue(mockResult);

      const req = {
        user: { _id: "admin_1", role: "ADMIN" },
        shop: null,
        query: {},
      };

      await listRefunds(req, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(refundService.listRefundsForShop).toHaveBeenCalledWith(null, {
        page: undefined,
        limit: undefined,
        isAdmin: true,
      });
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });
  });
});
