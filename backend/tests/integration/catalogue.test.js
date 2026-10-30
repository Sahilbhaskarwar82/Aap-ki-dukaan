import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";

import app from "../../src/app.js";
import { Supplier } from "../../src/models/Supplier.model.js";
import { Product } from "../../src/models/Product.model.js";
import { SupplierOffer } from "../../src/models/SupplierOffer.model.js";

let mongoServer;

describe("Supplier Catalogue Models & Search APIs Integration Tests (SAH-05)", () => {
  let supplierA;
  let supplierB;
  let productCup;
  let productBox;
  let activeOffer;
  let expiredOffer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Promise.all([
      Supplier.deleteMany({}),
      Product.deleteMany({}),
      SupplierOffer.deleteMany({}),
    ]);

    // 1. Seed Demo Suppliers
    supplierA = await Supplier.create({
      name: "Bharat EcoPack Wholesalers",
      contactReference: {
        contactPerson: "Rajesh Kumar",
        email: "supplier1@demo.aapkidukan.in",
        phone: "+91 98765 43210",
        address: "Industrial Area, Phase 2, New Delhi",
      },
      serviceAreas: ["DELHI_NCR", "LUCKNOW", "CHANDIGARH"],
      verificationStatus: "VERIFIED",
      activeStatus: "ACTIVE",
      dataSourceType: "SEEDED_DEMO",
    });

    supplierB = await Supplier.create({
      name: "Northern Foodservice Supplies",
      contactReference: {
        contactPerson: "Sunil Verma",
        email: "supplier2@demo.aapkidukan.in",
        phone: "+91 98111 22334",
      },
      serviceAreas: ["MUMBAI", "PUNE"],
      verificationStatus: "DEMO_ONLY",
      activeStatus: "ACTIVE",
      dataSourceType: "SEEDED_DEMO",
    });

    // 2. Seed Master Products
    productCup = await Product.create({
      canonicalName: "12-oz Food-Safe PE-Lined Paper Cups",
      category: "PACKAGING",
      baseUnit: "BOX",
      packSizeDescription: "1000 cups / box",
      unitsPerPack: 1000,
      specifications: {
        material: "Food-grade PE-coated paperboard",
        capacityOrSize: "12-oz (350ml)",
        foodSafe: true,
        certifications: ["FSSAI_COMPLIANT", "ISO_9001"],
        grade: "PREMIUM",
      },
      synonyms: ["12oz hot paper cups", "chai disposable cups"],
      brand: "GENERIC",
      isActive: true,
    });

    productBox = await Product.create({
      canonicalName: "Wholesale Corrugated Takeout Boxes",
      category: "PACKAGING",
      baseUnit: "UNIT",
      packSizeDescription: "1 unit",
      unitsPerPack: 1,
      specifications: {
        material: "3-ply corrugated kraft paper",
        capacityOrSize: "Medium 8x6x3 inch",
        foodSafe: true,
      },
      synonyms: ["kraft takeaway container"],
      isActive: true,
    });

    // 3. Seed Supplier Offers (with Two-Level MOQ: MOQ_W=50 boxes, p_min=20%, p_step=1%)
    activeOffer = await SupplierOffer.create({
      supplierId: supplierA._id,
      productId: productCup._id,
      supplierProductDescription: "Export quality 12-oz paper cups, 1000 pcs per carton",
      packUnit: "BOX",
      packSize: "1000 cups / box",
      currency: "INR",
      baseUnitPriceMinor: 10000, // ₹100.00
      quantityTiers: [
        { minQuantity: 1, maxQuantity: 29, unitPriceMinor: 10000 },
        { minQuantity: 30, maxQuantity: 49, unitPriceMinor: 9000 },
        { minQuantity: 50, maxQuantity: null, unitPriceMinor: 8000 },
      ],
      minimumOrderQuantity: 50, // Wholesale MOQ_W = 50 boxes
      retailerMoqPercentage: 20, // 20% -> MOQ_R = 10 boxes
      retailerStepPercentage: 1, // 1% -> Step = 1 box (or round)
      quantityStepMultipleOverride: 5, // Explicit override: Step = 5 boxes
      deliveryAreas: ["DELHI_NCR", "LUCKNOW"],
      leadTimeDays: 3,
      shippingTerms: "EX_WORKS",
      flatShippingCostMinor: 50000, // ₹500 flat
      taxInclusion: "GST_EXCLUDED",
      availabilityStatus: "IN_STOCK",
      quoteTimestamp: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Valid for 7 days
      dataSourceType: "SEEDED_DEMO",
      verificationStatus: "VERIFIED",
      isActive: true,
    });

    // Expired Offer (to verify exclusion)
    expiredOffer = await SupplierOffer.create({
      supplierId: supplierB._id,
      productId: productCup._id,
      packUnit: "BOX",
      packSize: "1000 cups / box",
      currency: "INR",
      baseUnitPriceMinor: 9500,
      minimumOrderQuantity: 100,
      retailerMoqPercentage: 20,
      retailerStepPercentage: 1,
      deliveryAreas: ["MUMBAI"],
      leadTimeDays: 5,
      shippingTerms: "EX_WORKS",
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Expired yesterday
      dataSourceType: "SEEDED_DEMO",
      verificationStatus: "DEMO_SAMPLE",
      isActive: true,
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Supplier Listing & Detail APIs
  // ───────────────────────────────────────────────────────────────────────────
  describe("Supplier APIs (GET /api/suppliers & GET /api/suppliers/:id)", () => {
    it("lists active suppliers filtered by regional service area", async () => {
      const res = await request(app).get("/api/suppliers?serviceArea=DELHI_NCR");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.suppliers.length).toBe(1);
      expect(res.body.data.suppliers[0].name).toBe("Bharat EcoPack Wholesalers");
    });

    it("searches suppliers by name keyword", async () => {
      const res = await request(app).get("/api/suppliers?search=Northern");

      expect(res.status).toBe(200);
      expect(res.body.data.suppliers.length).toBe(1);
      expect(res.body.data.suppliers[0].name).toBe("Northern Foodservice Supplies");
    });

    it("retrieves supplier by valid ID", async () => {
      const res = await request(app).get(`/api/suppliers/${supplierA._id}`);

      expect(res.status).toBe(200);
      expect(res.body.data._id).toBe(supplierA._id.toString());
      expect(res.body.data.contactReference.email).toBe("supplier1@demo.aapkidukan.in");
    });

    it("returns 404 when supplier ID does not exist", async () => {
      const randomId = new mongoose.Types.ObjectId();
      const res = await request(app).get(`/api/suppliers/${randomId}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Product Search API
  // ───────────────────────────────────────────────────────────────────────────
  describe("Product Search API (GET /api/products/search)", () => {
    it("searches products by text keyword (canonicalName or synonyms)", async () => {
      const res = await request(app).get("/api/products/search?q=paper cups");

      expect(res.status).toBe(200);
      expect(res.body.data.products.length).toBe(1);
      expect(res.body.data.products[0].canonicalName).toContain("Paper Cups");
      expect(res.body.data.products[0].specifications.foodSafe).toBe(true);
    });

    it("filters products by category and food-safe flag", async () => {
      const res = await request(app).get("/api/products/search?category=PACKAGING&foodSafe=true");

      expect(res.status).toBe(200);
      expect(res.body.data.products.length).toBe(2);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Supplier Offer Search API & Two-Level MOQ Virtuals
  // ───────────────────────────────────────────────────────────────────────────
  describe("Supplier Offer Search API (GET /api/offers/search)", () => {
    it("finds active offers matching delivery area and populates product and supplier", async () => {
      const res = await request(app).get("/api/offers/search?deliveryArea=DELHI_NCR");

      expect(res.status).toBe(200);
      expect(res.body.data.offers.length).toBe(1);

      const offer = res.body.data.offers[0];
      expect(offer.supplierId.name).toBe("Bharat EcoPack Wholesalers");
      expect(offer.productId.canonicalName).toContain("Paper Cups");
      expect(offer.baseUnitPriceMinor).toBe(10000);
      expect(offer.quantityTiers.length).toBe(3);
    });

    it("filters offers by maximum wholesale MOQ threshold", async () => {
      // MOQ_W = 50 boxes <= 60
      const resPass = await request(app).get("/api/offers/search?maxMoq=60");
      expect(resPass.body.data.offers.length).toBe(1);

      // MOQ_W = 50 boxes > 30 (should be excluded)
      const resFail = await request(app).get("/api/offers/search?maxMoq=30");
      expect(resFail.body.data.offers.length).toBe(0);
    });

    it("excludes expired offers by default and includes them when includeExpired=true", async () => {
      // Default: expired offer excluded
      const resActive = await request(app).get("/api/offers/search");
      expect(resActive.body.data.offers.length).toBe(1);

      // With includeExpired=true
      const resAll = await request(app).get("/api/offers/search?includeExpired=true");
      expect(resAll.body.data.offers.length).toBe(2);
    });

    it("correctly computes Two-Level MOQ virtuals (computedRetailerMoq & computedRetailerStep)", async () => {
      const offerDoc = await SupplierOffer.findById(activeOffer._id);

      // Wholesale MOQ = 50 boxes, retailerMoqPercentage = 20% -> MOQ_R = 10 boxes
      expect(offerDoc.computedRetailerMoq).toBe(10);

      // Step override = 5 boxes
      expect(offerDoc.computedRetailerStep).toBe(5);
    });
  });
});

