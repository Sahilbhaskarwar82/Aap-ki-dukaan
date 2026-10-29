/**
 * Integration Tests — SRU-07
 * Separate SupplierSettlement Model & Settlement Lifecycle Service
 *
 * Enforces BR-009 & FR-PAY-016:
 * Tracks wholesaler payout in SupplierSettlement completely separately from buyer Payment captures.
 *
 * Verifies:
 *  1. Capturing buyer payments NEVER marks SupplierSettlement as CONFIRMED or live bank transfer.
 *  2. Default prototype settlement is strictly settlementStatus='SIMULATED' and mode='DEMO'.
 *  3. Retailers/Shop owners receive 403 Forbidden when trying to view settlement details.
 *  4. Assigned Supplier receives 200 OK to view their settlement record.
 *  5. Unrelated Supplier receives 403 Forbidden.
 *  6. Platform Admin can update settlement status (e.g. to CONFIRMED with providerReference).
 *  7. Non-admin attempting to update settlement receives 403 Forbidden.
 *  8. Invalid settlement status or mode is rejected with 400 Bad Request.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import express from "express";

import { Order } from "../../src/models/Order.model.js";
import { Payment } from "../../src/models/Payment.model.js";
import { SupplierSettlement } from "../../src/models/SupplierSettlement.model.js";
import orderRouter from "../../src/routes/order.routes.js";
import {
  createOrGetSupplierSettlement,
  getSupplierSettlement,
  updateSupplierSettlement,
} from "../../src/services/orders/order.service.js";

function buildTestApp(getUser) {
  const app = express();
  app.use(express.json());

  app.use((req, _res, next) => {
    req.user = typeof getUser === "function" ? getUser(req) : getUser;
    next();
  });

  app.use("/api/orders", orderRouter);

  app.use((err, _req, res, _next) => {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      statusCode,
      message: err.message,
    });
  });

  return app;
}

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { retryWrites: false });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("Task SRU-07: Supplier Settlement Lifecycle", () => {
  let supplierId;
  let poolId;
  let shopAId;
  let testOrder;
  let contribAId;

  beforeEach(async () => {
    await Order.deleteMany({});
    await Payment.deleteMany({});
    await SupplierSettlement.deleteMany({});

    supplierId = new mongoose.Types.ObjectId();
    poolId = new mongoose.Types.ObjectId();
    shopAId = new mongoose.Types.ObjectId();
    contribAId = new mongoose.Types.ObjectId();

    testOrder = await Order.create({
      orderNumber: "AKD-2026-SETTLE-001",
      poolId,
      supplierId,
      productId: new mongoose.Types.ObjectId(),
      supplierOfferId: new mongoose.Types.ObjectId(),
      priceSnapshotId: new mongoose.Types.ObjectId(),
      currency: "INR",
      totalQuantity: 60,
      unit: "BOX",
      merchandiseTotalMinor: 480000,
      shippingTotalMinor: 20000,
      grandTotalMinor: 500000, // ₹5,000.00
      orderState: "CONFIRMED",
      supplierConfirmationStatus: "CONFIRMED",
      isSimulatedConfirmation: true,
      memberOrders: [
        {
          contributionId: contribAId,
          shopId: shopAId,
          shopName: "Hazratganj Café",
          quantity: 60,
          unit: "BOX",
          unitPriceMinor: 8000,
          merchandiseShareMinor: 480000,
          shippingShareMinor: 20000,
          totalPaidMinor: 500000,
          deliveryStatus: "PENDING",
        },
      ],
    });
  });

  it("1. BR-009 & FR-PAY-016: Capturing buyer payment leaves SupplierSettlement as SIMULATED (never conflated)", async () => {
    // 1a. Buyer completes 100% PayPal payment
    const payment = await Payment.create({
      poolId,
      contributionId: contribAId,
      shopId: shopAId,
      payerUserId: new mongoose.Types.ObjectId(),
      paymentPurpose: "INITIAL_JOIN",
      provider: "PAYPAL_SANDBOX",
      providerOrderId: "ORD-SANDBOX-777",
      providerCaptureId: "CAP-SANDBOX-777",
      idempotencyKey: "idem-settle-001",
      amountMinor: 500000,
      currency: "INR",
      paymentStatus: "PAID",
      capturedAt: new Date(),
      isTestTransaction: true,
    });

    expect(payment.paymentStatus).toBe("PAID");

    // 1b. Create or inspect the SupplierSettlement
    const settlement = await createOrGetSupplierSettlement(testOrder._id);

    // CRITICAL ASSERTIONS:
    // Even though 100% of buyer money was captured (PAID), supplier settlement
    // must strictly remain SIMULATED and DEMO in the prototype!
    expect(settlement.settlementStatus).toBe("SIMULATED");
    expect(settlement.mode).toBe("DEMO");
    expect(settlement.confirmedAt).toBeNull();
    expect(settlement.providerReference).toBeNull();
    expect(settlement.amountMinor).toBe(500000);
    expect(settlement.notes).toContain("Simulated supplier settlement for prototype demonstration");
  });

  it("2. Default prototype settlement is strictly settlementStatus='SIMULATED' and mode='DEMO'", async () => {
    const settlement = await createOrGetSupplierSettlement(testOrder._id);

    expect(settlement.settlementStatus).toBe("SIMULATED");
    expect(settlement.mode).toBe("DEMO");
    expect(settlement.currency).toBe("INR");
    expect(settlement.amountMinor).toBe(500000);
    expect(settlement.orderId.toString()).toBe(testOrder._id.toString());
    expect(settlement.supplierId.toString()).toBe(supplierId.toString());
  });

  it("3. Retailer / Shop Owner receives 403 Forbidden when requesting supplier settlement", async () => {
    const buyerUser = {
      _id: new mongoose.Types.ObjectId(),
      role: "SHOP_OWNER",
      shopId: shopAId.toString(),
    };

    const app = buildTestApp(buyerUser);
    const res = await request(app).get(`/api/orders/${testOrder._id}/settlement`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Forbidden|permission/i);
  });

  it("4. Assigned Supplier receives 200 OK to view their settlement record", async () => {
    const supplierUser = {
      _id: new mongoose.Types.ObjectId(),
      role: "SUPPLIER",
      supplierId: supplierId.toString(),
    };

    const app = buildTestApp(supplierUser);
    const res = await request(app).get(`/api/orders/${testOrder._id}/settlement`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.settlementStatus).toBe("SIMULATED");
    expect(res.body.data.mode).toBe("DEMO");
    expect(res.body.data.amountMinor).toBe(500000);
  });

  it("5. Unassigned / different Supplier receives 403 Forbidden", async () => {
    const differentSupplierId = new mongoose.Types.ObjectId();
    const wrongSupplierUser = {
      _id: new mongoose.Types.ObjectId(),
      role: "SUPPLIER",
      supplierId: differentSupplierId.toString(),
    };

    const app = buildTestApp(wrongSupplierUser);
    const res = await request(app).get(`/api/orders/${testOrder._id}/settlement`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Forbidden/i);
  });

  it("6. Platform Admin can update settlement status (e.g. to CONFIRMED with providerReference)", async () => {
    const adminUser = {
      _id: new mongoose.Types.ObjectId(),
      role: "ADMIN",
    };

    const app = buildTestApp(adminUser);
    const res = await request(app)
      .patch(`/api/orders/${testOrder._id}/settlement`)
      .send({
        settlementStatus: "CONFIRMED",
        mode: "MANUAL",
        providerReference: "NEFT-UTR-20261029-0099",
        notes: "Settled via manual verified bank transfer with supplier invoice.",
      });

    expect(res.status).toBe(200);
    expect(res.body.data.settlementStatus).toBe("CONFIRMED");
    expect(res.body.data.mode).toBe("MANUAL");
    expect(res.body.data.providerReference).toBe("NEFT-UTR-20261029-0099");
    expect(res.body.data.confirmedAt).toBeDefined();

    // Verify DB updated
    const dbRecord = await SupplierSettlement.findOne({ orderId: testOrder._id });
    expect(dbRecord.settlementStatus).toBe("CONFIRMED");
    expect(dbRecord.mode).toBe("MANUAL");
  });

  it("7. Non-admin attempting to update settlement receives 403 Forbidden", async () => {
    const supplierUser = {
      _id: new mongoose.Types.ObjectId(),
      role: "SUPPLIER",
      supplierId: supplierId.toString(),
    };

    const app = buildTestApp(supplierUser);
    const res = await request(app)
      .patch(`/api/orders/${testOrder._id}/settlement`)
      .send({
        settlementStatus: "CONFIRMED",
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Only platform administrators/i);
  });

  it("8. Invalid settlement status or mode is rejected with 400 Bad Request", async () => {
    const adminUser = {
      _id: new mongoose.Types.ObjectId(),
      role: "ADMIN",
    };

    const app = buildTestApp(adminUser);
    const res = await request(app)
      .patch(`/api/orders/${testOrder._id}/settlement`)
      .send({
        settlementStatus: "INVALID_STATUS_XYZ",
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid settlementStatus/i);
  });
});
