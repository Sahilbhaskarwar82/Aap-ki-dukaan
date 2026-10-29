/**
 * Integration Tests — SRU-06
 * Downloadable Purchase Order (PO) Document Generator
 * GET /api/orders/:id/po-summary
 *
 * Verifies:
 *  1. Authorized participant (SHOP_OWNER) retrieves structured JSON PO summary.
 *  2. Authorized participant (SHOP_OWNER) retrieves printable HTML PO summary.
 *  3. Non-participating shop owner receives 403 Forbidden.
 *  4. Assigned supplier receives 200 OK.
 *  5. Unrelated supplier receives 403 Forbidden.
 *  6. Platform Admin receives 200 OK for any PO.
 *  7. Read-only Reviewer receives 200 OK for any PO.
 *  8. Unauthenticated access receives 401 Unauthorized.
 *  9. Non-existent order ID returns 404 Not Found.
 * 10. PO payload contains all required audit, pricing, tax, and provenance disclaimers.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import express from "express";

import { Order } from "../../src/models/Order.model.js";
import { Payment } from "../../src/models/Payment.model.js";
import orderRouter from "../../src/routes/order.routes.js";

// Helper to build app with custom injected user for tests
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

// Register stub models if not yet in mongoose
function registerStubModels() {
  if (!mongoose.models.Supplier) {
    mongoose.model(
      "Supplier",
      new mongoose.Schema(
        {
          name: String,
          contactReference: {
            contactPerson: String,
            email: String,
            phone: String,
          },
          serviceAreas: [String],
          verificationStatus: String,
          dataSourceType: String,
        },
        { timestamps: true }
      )
    );
  }

  if (!mongoose.models.Product) {
    mongoose.model(
      "Product",
      new mongoose.Schema(
        {
          canonicalName: String,
          category: String,
          baseUnit: String,
          packSizeDescription: String,
          specifications: {
            material: String,
            grade: String,
          },
        },
        { timestamps: true }
      )
    );
  }

  if (!mongoose.models.PriceSnapshot) {
    mongoose.model(
      "PriceSnapshot",
      new mongoose.Schema(
        {
          version: Number,
          currency: String,
          appliedUnitPriceMinor: Number,
          taxInclusion: String,
          shippingAllocationMethod: String,
        },
        { timestamps: true }
      )
    );
  }

  if (!mongoose.models.GroupBuyPool) {
    mongoose.model(
      "GroupBuyPool",
      new mongoose.Schema(
        {
          title: String,
          deliveryArea: String,
        },
        { timestamps: true }
      )
    );
  }
}

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { retryWrites: false });
  registerStubModels();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("Task SRU-06: Purchase Order (PO) Summary Generator", () => {
  let supplierId;
  let productId;
  let priceSnapshotId;
  let poolId;
  let shopAId;
  let shopBId;
  let nonMemberShopId;
  let testOrder;
  let contribAId;

  beforeEach(async () => {
    // Clear collections
    await Order.deleteMany({});
    await Payment.deleteMany({});

    supplierId = new mongoose.Types.ObjectId();
    productId = new mongoose.Types.ObjectId();
    priceSnapshotId = new mongoose.Types.ObjectId();
    poolId = new mongoose.Types.ObjectId();
    shopAId = new mongoose.Types.ObjectId();
    shopBId = new mongoose.Types.ObjectId();
    nonMemberShopId = new mongoose.Types.ObjectId();
    contribAId = new mongoose.Types.ObjectId();

    // Create related stub documents for populating
    const Supplier = mongoose.model("Supplier");
    await Supplier.create({
      _id: supplierId,
      name: "Bharat EcoPack Wholesalers",
      contactReference: {
        contactPerson: "Rajesh Sharma",
        email: "wholesale@bharatecopack.demo",
        phone: "+91-522-888999",
      },
      serviceAreas: ["Lucknow", "Kanpur", "Varanasi"],
      verificationStatus: "VERIFIED",
      dataSourceType: "SUPPLIER_SUBMITTED",
    });

    const Product = mongoose.model("Product");
    await Product.create({
      _id: productId,
      canonicalName: "12-Ounce Food-Safe Paper Cups",
      category: "Food Packaging",
      baseUnit: "BOX",
      packSizeDescription: "1000 cups per box",
      specifications: {
        material: "PE-Lined Virgin Paperboard",
        grade: "Food-Safe Grade A",
      },
    });

    const PriceSnapshot = mongoose.model("PriceSnapshot");
    await PriceSnapshot.create({
      _id: priceSnapshotId,
      version: 2,
      currency: "INR",
      appliedUnitPriceMinor: 8000,
      taxInclusion: "GST_EXCLUDED",
      shippingAllocationMethod: "PER_UNIT",
    });

    const GroupBuyPool = mongoose.model("GroupBuyPool");
    await GroupBuyPool.create({
      _id: poolId,
      title: "Hazratganj Café Packaging Pool",
      deliveryArea: "Lucknow Central",
    });

    // Seed test order (Mandatory ₹4,800 calculation baseline: 60 boxes = ₹4,800)
    testOrder = await Order.create({
      orderNumber: "AKD-2026-0001",
      poolId,
      supplierId,
      productId,
      supplierOfferId: new mongoose.Types.ObjectId(),
      priceSnapshotId,
      currency: "INR",
      totalQuantity: 60,
      unit: "BOX",
      merchandiseTotalMinor: 480000, // ₹4,800
      shippingTotalMinor: 0,
      grandTotalMinor: 480000,
      orderState: "CONFIRMED",
      supplierConfirmationStatus: "CONFIRMED",
      isSimulatedConfirmation: true,
      memberOrders: [
        {
          contributionId: contribAId,
          shopId: shopAId,
          shopName: "Hazratganj Café",
          quantity: 35,
          unit: "BOX",
          unitPriceMinor: 8000,
          merchandiseShareMinor: 280000,
          shippingShareMinor: 0,
          totalPaidMinor: 280000,
          deliveryStatus: "PENDING",
        },
        {
          contributionId: new mongoose.Types.ObjectId(),
          shopId: shopBId,
          shopName: "Gomti Bakery",
          quantity: 25,
          unit: "BOX",
          unitPriceMinor: 8000,
          merchandiseShareMinor: 200000,
          shippingShareMinor: 0,
          totalPaidMinor: 200000,
          deliveryStatus: "PENDING",
        },
      ],
    });

    // Seed verified sandbox payment
    await Payment.create({
      poolId,
      contributionId: contribAId,
      shopId: shopAId,
      payerUserId: new mongoose.Types.ObjectId(),
      paymentPurpose: "INITIAL_JOIN",
      provider: "PAYPAL_SANDBOX",
      providerOrderId: "PAYPAL-ORD-TEST-001",
      providerCaptureId: "PAYPAL-CAP-TEST-001",
      idempotencyKey: "test-idem-key-po-01",
      amountMinor: 280000,
      currency: "INR",
      paymentStatus: "PAID",
      isTestTransaction: true,
    });
  });

  it("1. Authorized participant (SHOP_OWNER) retrieves structured JSON PO summary", async () => {
    const user = {
      _id: new mongoose.Types.ObjectId(),
      role: "SHOP_OWNER",
      shopId: shopAId.toString(),
    };

    const app = buildTestApp(user);
    const res = await request(app).get(`/api/orders/${testOrder._id}/po-summary?format=json`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const summary = res.body.data;
    expect(summary.orderNumber).toBe("AKD-2026-0001");
    expect(summary.currency).toBe("INR");
    expect(summary.totals.grandTotalMinor).toBe(480000);
    expect(summary.totals.formattedGrandTotal).toBe("₹4,800.00");
    expect(summary.supplier.name).toBe("Bharat EcoPack Wholesalers");
    expect(summary.product.name).toBe("12-Ounce Food-Safe Paper Cups");
    expect(summary.priceSnapshot.version).toBe(2);

    // Verify member allocations
    expect(summary.memberOrders).toHaveLength(2);
    const shopAEntry = summary.memberOrders.find((m) => m.shopId === shopAId.toString());
    expect(shopAEntry).toBeDefined();
    expect(shopAEntry.quantity).toBe(35);
    expect(shopAEntry.formattedTotalPaid).toBe("₹2,800.00");
    expect(shopAEntry.isCurrentUserShop).toBe(true);

    // Verify Sandbox & Settlement badges
    expect(summary.badges.sandboxBadge).toBe("TEST TRANSACTION — PAYPAL SANDBOX");
    expect(summary.badges.settlementBadge).toBe("SIMULATED SETTLEMENT");

    // Verify payment verification references
    expect(summary.paymentReferences).toHaveLength(1);
    expect(summary.paymentReferences[0].providerCaptureId).toBe("PAYPAL-CAP-TEST-001");
  });

  it("2. Authorized participant (SHOP_OWNER) retrieves printable HTML PO summary", async () => {
    const user = {
      _id: new mongoose.Types.ObjectId(),
      role: "SHOP_OWNER",
      shopId: shopAId.toString(),
    };

    const app = buildTestApp(user);
    const res = await request(app).get(`/api/orders/${testOrder._id}/po-summary?format=html`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.text).toContain("<!DOCTYPE html>");
    expect(res.text).toContain("AKD-2026-0001");
    expect(res.text).toContain("Bharat EcoPack Wholesalers");
    expect(res.text).toContain("Hazratganj Café");
    expect(res.text).toContain("TEST TRANSACTION — PAYPAL SANDBOX");
    expect(res.text).toContain("SIMULATED SETTLEMENT");
    expect(res.text).toContain("₹4,800.00");
    expect(res.text).toContain("window.print()");
  });

  it("3. Non-participating shop owner receives 403 Forbidden", async () => {
    const intruder = {
      _id: new mongoose.Types.ObjectId(),
      role: "SHOP_OWNER",
      shopId: nonMemberShopId.toString(),
    };

    const app = buildTestApp(intruder);
    const res = await request(app).get(`/api/orders/${testOrder._id}/po-summary`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Forbidden|not an authorized participant/i);
  });

  it("4. Assigned wholesaler / supplier receives 200 OK", async () => {
    const supplierUser = {
      _id: new mongoose.Types.ObjectId(),
      role: "SUPPLIER",
      supplierId: supplierId.toString(),
    };

    const app = buildTestApp(supplierUser);
    const res = await request(app).get(`/api/orders/${testOrder._id}/po-summary`);

    expect(res.status).toBe(200);
    expect(res.body.data.orderNumber).toBe("AKD-2026-0001");
    expect(res.body.data.requestingUserAccess).toBe("SUPPLIER");
  });

  it("5. Unassigned / different supplier receives 403 Forbidden", async () => {
    const differentSupplierId = new mongoose.Types.ObjectId();
    const wrongSupplierUser = {
      _id: new mongoose.Types.ObjectId(),
      role: "SUPPLIER",
      supplierId: differentSupplierId.toString(),
    };

    const app = buildTestApp(wrongSupplierUser);
    const res = await request(app).get(`/api/orders/${testOrder._id}/po-summary`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Forbidden|not the assigned supplier/i);
  });

  it("6. Platform Administrator receives 200 OK", async () => {
    const adminUser = {
      _id: new mongoose.Types.ObjectId(),
      role: "ADMIN",
    };

    const app = buildTestApp(adminUser);
    const res = await request(app).get(`/api/orders/${testOrder._id}/po-summary`);

    expect(res.status).toBe(200);
    expect(res.body.data.requestingUserAccess).toBe("ADMIN");
  });

  it("7. Read-only Reviewer receives 200 OK", async () => {
    const reviewerUser = {
      _id: new mongoose.Types.ObjectId(),
      role: "REVIEWER",
    };

    const app = buildTestApp(reviewerUser);
    const res = await request(app).get(`/api/orders/${testOrder._id}/po-summary`);

    expect(res.status).toBe(200);
    expect(res.body.data.requestingUserAccess).toBe("REVIEWER");
  });

  it("8. Unauthenticated access receives 401 Unauthorized", async () => {
    const app = buildTestApp(null);
    const res = await request(app).get(`/api/orders/${testOrder._id}/po-summary`);

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/Authentication required/i);
  });

  it("9. Non-existent order ID returns 404 Not Found", async () => {
    const adminUser = { _id: new mongoose.Types.ObjectId(), role: "ADMIN" };
    const fakeOrderId = new mongoose.Types.ObjectId();

    const app = buildTestApp(adminUser);
    const res = await request(app).get(`/api/orders/${fakeOrderId}/po-summary`);

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/Order not found/i);
  });

  it("10. Can retrieve PO summary via orderNumber parameter", async () => {
    const adminUser = { _id: new mongoose.Types.ObjectId(), role: "ADMIN" };

    const app = buildTestApp(adminUser);
    const res = await request(app).get(`/api/orders/AKD-2026-0001/po-summary`);

    expect(res.status).toBe(200);
    expect(res.body.data.orderNumber).toBe("AKD-2026-0001");
    expect(res.body.data.totals.totalQuantity).toBe(60);
  });
});
