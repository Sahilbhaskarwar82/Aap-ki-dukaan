import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import express from "express";

import { Quote } from "../../src/models/Quote.model.js";
import { Supplier } from "../../src/models/Supplier.model.js";
import { Product } from "../../src/models/Product.model.js";
import { GroupBuyPool } from "../../src/models/GroupBuyPool.model.js";
import { SupplierOffer } from "../../src/models/SupplierOffer.model.js";
import { User } from "../../src/models/User.model.js";
import quoteRouter from "../../src/routes/quote.routes.js";

let mongoServer;
let testApp;
let currentUser = null;

function buildTestApp() {
  const app = express();
  app.use(express.json());

  // Inject test session user context
  app.use((req, _res, next) => {
    req.user = currentUser;
    next();
  });

  app.use("/api/quotes", quoteRouter);

  // Centralized test error handler
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

describe("Custom & Revised Supplier Quote Workflow Integration Tests (SAH-09)", () => {
  let supplierUser;
  let supplierBUser;
  let shopOwnerUser;
  let adminUser;
  let supplierDoc;
  let supplierBDoc;
  let productDoc;
  let poolDoc;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    testApp = buildTestApp();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Promise.all([
      Quote.deleteMany({}),
      Supplier.deleteMany({}),
      Product.deleteMany({}),
      GroupBuyPool.deleteMany({}),
      SupplierOffer.deleteMany({}),
      User.deleteMany({}),
    ]);

    // 1. Seed Real User Documents in Database
    supplierUser = await User.create({
      name: "Bharat Supplier Admin",
      role: "SUPPLIER",
      email: "supplier@demo.com",
      passwordHash: "Password123!",
    });

    supplierBUser = await User.create({
      name: "Other Supplier",
      role: "SUPPLIER",
      email: "other_supplier@demo.com",
      passwordHash: "Password123!",
    });

    shopOwnerUser = await User.create({
      name: "Chai Point Lucknow",
      role: "SHOP_OWNER",
      email: "retailer@demo.com",
      passwordHash: "Password123!",
    });

    adminUser = await User.create({
      name: "CoBuy Super Admin",
      role: "ADMIN",
      email: "admin@aapkidukan.in",
      passwordHash: "Password123!",
    });

    // 2. Seed Master Supplier & Product
    supplierDoc = await Supplier.create({
      name: "Bharat EcoPack Wholesalers",
      ownerUserId: supplierUser._id,
      contactReference: {
        contactPerson: "Rajesh Kumar",
        email: "bharat@ecopack.in",
        phone: "+91 98765 43210",
      },
      serviceAreas: ["DELHI_NCR", "LUCKNOW"],
      verificationStatus: "VERIFIED",
      activeStatus: "ACTIVE",
      dataSourceType: "SEEDED_DEMO",
    });

    supplierBDoc = await Supplier.create({
      name: "Southern Paper Mills",
      ownerUserId: supplierBUser._id,
      serviceAreas: ["BANGALORE"],
      verificationStatus: "VERIFIED",
      activeStatus: "ACTIVE",
      dataSourceType: "SEEDED_DEMO",
    });

    productDoc = await Product.create({
      canonicalName: "12-oz Food-Safe PE-Lined Paper Cups",
      category: "PACKAGING",
      baseUnit: "BOX",
      packSizeDescription: "1000 cups / box",
      unitsPerPack: 1000,
      specifications: {
        material: "Food-grade paper",
        capacityOrSize: "12-oz",
        foodSafe: true,
      },
      isActive: true,
    });

    // 3. Seed Supplier Offer and Under-MOQ Pool
    const offerDoc = await SupplierOffer.create({
      supplierId: supplierDoc._id,
      productId: productDoc._id,
      packUnit: "BOX",
      packSize: "1000 cups / box",
      currency: "INR",
      baseUnitPriceMinor: 10000,
      minimumOrderQuantity: 50,
      deliveryAreas: ["DELHI_NCR"],
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      quoteTimestamp: new Date(),
    });

    poolDoc = await GroupBuyPool.create({
      title: "Delhi Café Cup Group Buy",
      productId: productDoc._id,
      supplierOfferId: offerDoc._id,
      deliveryArea: "DELHI_NCR",
      currency: "INR",
      packUnit: "BOX",
      targetMoq: 50,
      minRetailerQuantity: 10,
      quantityStepMultiple: 5,
      totalEligibleQuantity: 30, // Locked at 30 / 50 (Under MOQ)
      participantCount: 2,
      baseUnitPriceMinor: 10000,
      currentUnitPriceMinor: 10000,
      deadline: new Date(Date.now() - 3600000), // Ended 1 hour ago
      state: "UNDER_MOQ_DECISION_PENDING",
      supplierUnderMoqStatus: "NOT_APPLICABLE",
      createdByUserId: adminUser._id,
    });

    currentUser = shopOwnerUser;
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Quote Request Creation (POST /api/quotes/requests)
  // ───────────────────────────────────────────────────────────────────────────
  describe("Quote Request Creation (POST /api/quotes/requests)", () => {
    it("allows a shop owner to create a quote request for a supplier & product", async () => {
      currentUser = shopOwnerUser;

      const res = await request(testApp)
        .post("/api/quotes/requests")
        .send({
          supplierId: supplierDoc._id.toString(),
          productId: productDoc._id.toString(),
          requestedQuantity: 25,
          deliveryArea: "DELHI_NCR",
          requestReason: "NO_COMPATIBLE_OFFER",
          requestNotes: "Need prompt delivery for new branch opening.",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("REQUESTED");
      expect(res.body.data.requestedQuantity).toBe(25);
      expect(res.body.data.requestedByUserId).toBe(shopOwnerUser._id.toString());
      expect(res.body.data.supplierId).toBe(supplierDoc._id.toString());
      expect(res.body.data.source).toBe("BUYER_REQUEST");
    });

    it("links quote request to an under-MOQ pool and updates pool status to AWAITING_SUPPLIER", async () => {
      currentUser = shopOwnerUser;

      const res = await request(testApp)
        .post("/api/quotes/requests")
        .send({
          supplierId: supplierDoc._id.toString(),
          productId: productDoc._id.toString(),
          poolId: poolDoc._id.toString(),
          requestedQuantity: 30,
          deliveryArea: "DELHI_NCR",
          requestReason: "UNDER_MOQ_POOL",
          requestNotes: "Pool reached 30/50 boxes. Requesting revised pricing for 30 boxes.",
        });

      expect(res.status).toBe(201);
      expect(res.body.data.source).toBe("UNDER_MOQ_AUTO_TRIGGER");
      expect(res.body.data.poolId).toBe(poolDoc._id.toString());

      // Verify Pool status updated to AWAITING_SUPPLIER
      const updatedPool = await GroupBuyPool.findById(poolDoc._id);
      expect(updatedPool.supplierUnderMoqStatus).toBe("AWAITING_SUPPLIER");
    });

    it("rejects non-positive integer requested quantity with 400 Bad Request", async () => {
      currentUser = shopOwnerUser;

      const resZero = await request(testApp)
        .post("/api/quotes/requests")
        .send({
          supplierId: supplierDoc._id.toString(),
          productId: productDoc._id.toString(),
          requestedQuantity: 0,
          deliveryArea: "DELHI_NCR",
        });

      expect(resZero.status).toBe(400);
      expect(resZero.body.message).toMatch(/positive integer/i);

      const resDecimal = await request(testApp)
        .post("/api/quotes/requests")
        .send({
          supplierId: supplierDoc._id.toString(),
          productId: productDoc._id.toString(),
          requestedQuantity: 12.5,
          deliveryArea: "DELHI_NCR",
        });

      expect(resDecimal.status).toBe(400);
    });

    it("rejects non-existent supplier or product with 404 Not Found", async () => {
      currentUser = shopOwnerUser;
      const fakeId = new mongoose.Types.ObjectId().toString();

      const res = await request(testApp)
        .post("/api/quotes/requests")
        .send({
          supplierId: fakeId,
          productId: productDoc._id.toString(),
          requestedQuantity: 20,
          deliveryArea: "DELHI_NCR",
        });

      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/Supplier record not found/i);
    });

    it("blocks unauthorized role (e.g. SUPPLIER) from submitting buyer quote request", async () => {
      currentUser = supplierUser; // Role is SUPPLIER, not SHOP_OWNER or ADMIN

      const res = await request(testApp)
        .post("/api/quotes/requests")
        .send({
          supplierId: supplierDoc._id.toString(),
          productId: productDoc._id.toString(),
          requestedQuantity: 20,
          deliveryArea: "DELHI_NCR",
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/Access forbidden/i);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Quote Listing & Role-Based Isolation (GET /api/quotes & GET /:id)
  // ───────────────────────────────────────────────────────────────────────────
  describe("Quote Listing & Data Isolation (GET /api/quotes)", () => {
    let quote1;
    let quote2;

    beforeEach(async () => {
      // Quote 1: requested by shopOwnerUser to Bharat EcoPack (supplierDoc)
      quote1 = await Quote.create({
        supplierId: supplierDoc._id,
        productId: productDoc._id,
        requestedByUserId: shopOwnerUser._id,
        requestedQuantity: 20,
        deliveryArea: "DELHI_NCR",
        status: "REQUESTED",
        source: "BUYER_REQUEST",
      });

      // Quote 2: requested by Admin to Southern Paper Mills (supplierBDoc)
      quote2 = await Quote.create({
        supplierId: supplierBDoc._id,
        productId: productDoc._id,
        requestedByUserId: adminUser._id,
        requestedQuantity: 100,
        deliveryArea: "BANGALORE",
        status: "REQUESTED",
        source: "ADMIN_INITIATED",
      });
    });

    it("restricts SHOP_OWNER to only seeing quotes they requested", async () => {
      currentUser = shopOwnerUser;

      const res = await request(testApp).get("/api/quotes");
      expect(res.status).toBe(200);
      expect(res.body.data.quotes.length).toBe(1);
      expect(res.body.data.quotes[0]._id).toBe(quote1._id.toString());
    });

    it("restricts SUPPLIER to only seeing quotes directed to their supplier company", async () => {
      currentUser = supplierUser; // Owns supplierDoc

      const res = await request(testApp).get("/api/quotes");
      expect(res.status).toBe(200);
      expect(res.body.data.quotes.length).toBe(1);
      expect(res.body.data.quotes[0]._id).toBe(quote1._id.toString());
      expect(res.body.data.quotes[0].supplierId._id).toBe(supplierDoc._id.toString());
    });

    it("allows ADMIN to see all quotes across all suppliers and buyers", async () => {
      currentUser = adminUser;

      const res = await request(testApp).get("/api/quotes");
      expect(res.status).toBe(200);
      expect(res.body.data.quotes.length).toBe(2);
    });

    it("retrieves a quote by ID when authorized", async () => {
      currentUser = shopOwnerUser;

      const res = await request(testApp).get(`/api/quotes/${quote1._id}`);
      expect(res.status).toBe(200);
      expect(res.body.data._id).toBe(quote1._id.toString());
      expect(res.body.data.productName || res.body.data.productId.canonicalName).toContain("Paper Cups");
    });

    it("blocks an unauthorized shop owner from retrieving another buyer's quote", async () => {
      // Current user is shopOwnerUser, but quote2 was created by adminUser
      currentUser = shopOwnerUser;

      const res = await request(testApp).get(`/api/quotes/${quote2._id}`);
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/Access denied/i);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Supplier Quote Response (PATCH /api/quotes/:id/respond)
  // ───────────────────────────────────────────────────────────────────────────
  describe("Supplier Quote Response (PATCH /api/quotes/:id/respond)", () => {
    let pendingQuote;

    beforeEach(async () => {
      pendingQuote = await Quote.create({
        supplierId: supplierDoc._id,
        productId: productDoc._id,
        poolId: poolDoc._id,
        requestedByUserId: shopOwnerUser._id,
        requestedQuantity: 30,
        deliveryArea: "DELHI_NCR",
        status: "REQUESTED",
        source: "UNDER_MOQ_AUTO_TRIGGER",
      });
    });

    it("allows assigned supplier to submit binding pricing, shipping, and validity date", async () => {
      currentUser = supplierUser; // Owns supplierDoc

      const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();

      const res = await request(testApp)
        .patch(`/api/quotes/${pendingQuote._id}/respond`)
        .send({
          action: "PROVIDE",
          unitPriceMinor: 8500, // ₹85.00
          shippingCostMinor: 40000, // ₹400.00
          shippingTerms: "EX_WORKS",
          taxInclusion: "GST_EXCLUDED",
          leadTimeDays: 4,
          validUntil: futureDate,
          subMoqTerms: {
            acceptsSubMoq: true,
            minSubMoqQuantity: 25,
            surchargeMinor: 500, // ₹5.00 sub-MOQ surcharge
            supplierNotes: "Batch accepted for 30 boxes with nominal sub-MOQ handling.",
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const quote = res.body.data;
      expect(quote.status).toBe("PROVIDED");
      expect(quote.unitPriceMinor).toBe(8500);
      expect(quote.shippingCostMinor).toBe(40000);
      expect(quote.leadTimeDays).toBe(4);
      expect(quote.subMoqTerms.acceptsSubMoq).toBe(true);

      // Verify synchronization with GroupBuyPool
      const pool = await GroupBuyPool.findById(poolDoc._id);
      expect(pool.supplierUnderMoqStatus).toBe("REVISED_QUOTE_PROVIDED");
      expect(pool.activeQuoteId.toString()).toBe(pendingQuote._id.toString());
      expect(pool.currentUnitPriceMinor).toBe(8500);
    });

    it("rejects response when validUntil timestamp is in the past", async () => {
      currentUser = supplierUser;

      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const res = await request(testApp)
        .patch(`/api/quotes/${pendingQuote._id}/respond`)
        .send({
          action: "PROVIDE",
          unitPriceMinor: 8500,
          validUntil: pastDate,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/valid future date/i);
    });

    it("rejects response when unitPriceMinor is negative or zero", async () => {
      currentUser = supplierUser;
      const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();

      const res = await request(testApp)
        .patch(`/api/quotes/${pendingQuote._id}/respond`)
        .send({
          action: "PROVIDE",
          unitPriceMinor: -100,
          validUntil: futureDate,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/positive integer/i);
    });

    it("blocks a different supplier from responding to another supplier's quote", async () => {
      currentUser = supplierBUser; // Owns supplierBDoc, NOT supplierDoc

      const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();

      const res = await request(testApp)
        .patch(`/api/quotes/${pendingQuote._id}/respond`)
        .send({
          action: "PROVIDE",
          unitPriceMinor: 8500,
          validUntil: futureDate,
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/Access denied/i);
    });

    it("allows supplier to reject a quote with clear reason and updates pool status", async () => {
      currentUser = supplierUser;

      const res = await request(testApp)
        .patch(`/api/quotes/${pendingQuote._id}/respond`)
        .send({
          action: "REJECT",
          rejectionReason: "Factory production capacity full for the requested delivery window.",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("REJECTED");
      expect(res.body.data.subMoqTerms.supplierNotes).toContain("Factory production capacity full");

      // Verify pool state updated
      const pool = await GroupBuyPool.findById(poolDoc._id);
      expect(pool.supplierUnderMoqStatus).toBe("REJECTED_SUB_MOQ");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Quote Expiration Handling
  // ───────────────────────────────────────────────────────────────────────────
  describe("Quote Expiration Evaluation", () => {
    it("evaluates isExpired virtual as true and marks status as EXPIRED when validUntil has passed", async () => {
      const expiredQuote = await Quote.create({
        supplierId: supplierDoc._id,
        productId: productDoc._id,
        requestedByUserId: shopOwnerUser._id,
        requestedQuantity: 20,
        deliveryArea: "DELHI_NCR",
        unitPriceMinor: 9000,
        status: "PROVIDED",
        validUntil: new Date(Date.now() - 3600000), // Expired 1 hour ago
      });

      expect(expiredQuote.isExpired).toBe(true);

      // Accessing quote evaluates freshness and transitions status to EXPIRED
      currentUser = shopOwnerUser;
      const res = await request(testApp).get(`/api/quotes/${expiredQuote._id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("EXPIRED");
      expect(res.body.data.isExpired).toBe(true);
    });
  });
});

