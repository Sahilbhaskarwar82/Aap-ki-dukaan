import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import express from "express";

import { Requirement } from "../../src/models/Requirement.model.js";
import { Product } from "../../src/models/Product.model.js";
import { Supplier } from "../../src/models/Supplier.model.js";
import { SupplierOffer } from "../../src/models/SupplierOffer.model.js";
import requirementRouter from "../../src/routes/requirement.routes.js";

let mongoServer;
let testApp;
let currentUser = null;

function buildTestApp() {
  const app = express();
  app.use(express.json());

  app.use((req, _res, next) => {
    req.user = currentUser;
    next();
  });

  app.use("/api/requirements", requirementRouter);

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

describe("Hard-Constraint Compatibility Filter & AI Candidate Matching Integration Tests (SAH-06)", () => {
  const shopAId = new mongoose.Types.ObjectId("111111111111111111111111");
  const shopBId = new mongoose.Types.ObjectId("222222222222222222222222");
  const userAId = new mongoose.Types.ObjectId("aaaaaaaaaaaaaaaaaaaaaaaa");
  const userBId = new mongoose.Types.ObjectId("bbbbbbbbbbbbbbbbbbbbbbbb");

  let supplierA;
  let supplierB;
  let product12OzPaper;
  let product8OzPolystyrene;
  let confirmedReq;

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
      Requirement.deleteMany({}),
      Product.deleteMany({}),
      Supplier.deleteMany({}),
      SupplierOffer.deleteMany({}),
    ]);

    currentUser = {
      _id: userAId,
      shopId: shopAId,
      role: "SHOP_OWNER",
    };

    // 1. Seed Wholesaler Suppliers
    supplierA = await Supplier.create({
      name: "Bharat EcoPack Wholesalers",
      serviceAreas: ["DELHI_NCR", "LUCKNOW"],
      verificationStatus: "VERIFIED",
      activeStatus: "ACTIVE",
      dataSourceType: "SEEDED_DEMO",
    });

    supplierB = await Supplier.create({
      name: "Northern Supplies Co",
      serviceAreas: ["MUMBAI"],
      verificationStatus: "DEMO_ONLY",
      activeStatus: "ACTIVE",
      dataSourceType: "SEEDED_DEMO",
    });

    // 2. Seed Master Products
    product12OzPaper = await Product.create({
      canonicalName: "12-oz Food-Safe PE-Lined Paper Cups",
      category: "PACKAGING",
      baseUnit: "BOX",
      packSizeDescription: "1000 cups / box",
      specifications: {
        material: "Food-grade PE-coated paper",
        capacityOrSize: "12-oz",
        foodSafe: true,
      },
      isActive: true,
    });

    product8OzPolystyrene = await Product.create({
      canonicalName: "8-oz Polystyrene Foam Cups",
      category: "PACKAGING",
      baseUnit: "BOX",
      packSizeDescription: "1000 cups / box",
      specifications: {
        material: "Polystyrene foam",
        capacityOrSize: "8-oz",
        foodSafe: false,
      },
      isActive: true,
    });

    // 3. Seed Supplier Offers
    // Offer 1: Exact match (12-oz Paper, Lucknow, fresh)
    await SupplierOffer.create({
      supplierId: supplierA._id,
      productId: product12OzPaper._id,
      packUnit: "BOX",
      packSize: "1000 cups / box",
      baseUnitPriceMinor: 8000,
      minimumOrderQuantity: 50,
      deliveryAreas: ["LUCKNOW", "DELHI_NCR"],
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      isActive: true,
    });

    // Offer 2: Severe specification mismatch (8-oz Polystyrene)
    await SupplierOffer.create({
      supplierId: supplierA._id,
      productId: product8OzPolystyrene._id,
      packUnit: "BOX",
      packSize: "1000 cups / box",
      baseUnitPriceMinor: 5000,
      minimumOrderQuantity: 30,
      deliveryAreas: ["LUCKNOW"],
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      isActive: true,
    });

    // Offer 3: Unsupported delivery area (Mumbai only)
    await SupplierOffer.create({
      supplierId: supplierB._id,
      productId: product12OzPaper._id,
      packUnit: "BOX",
      packSize: "1000 cups / box",
      baseUnitPriceMinor: 7500,
      minimumOrderQuantity: 50,
      deliveryAreas: ["MUMBAI"],
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      isActive: true,
    });

    // Offer 4: Expired quote
    await SupplierOffer.create({
      supplierId: supplierA._id,
      productId: product12OzPaper._id,
      packUnit: "BOX",
      packSize: "1000 cups / box",
      baseUnitPriceMinor: 7800,
      minimumOrderQuantity: 50,
      deliveryAreas: ["LUCKNOW"],
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Expired yesterday
      isActive: true,
    });

    // 4. Seed Confirmed Requirement
    confirmedReq = await Requirement.create({
      shopId: shopAId,
      createdByUserId: userAId,
      sourceType: "FORM",
      status: "CONFIRMED",
      productName: "12-oz Food-Safe Paper Cups",
      category: "PACKAGING",
      requestedQuantity: 50,
      quantityUnit: "BOX",
      deliveryArea: "LUCKNOW",
      confirmedFields: {
        productName: "12-oz Food-Safe Paper Cups",
        category: "PACKAGING",
        requestedQuantity: 50,
        quantityUnit: "BOX",
        deliveryArea: "LUCKNOW",
        material: "Food-grade PE-coated paper",
        capacityOrSize: "12-oz",
        foodSafeRequired: true,
      },
    });
  });

  it("GET /api/requirements/:id/matches returns qualified matches and filters out expired & unsupported offers", async () => {
    const res = await request(testApp).get(`/api/requirements/${confirmedReq._id}/matches`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const { qualifiedMatches, filteredOutOffers, totalEvaluated, totalQualified } = res.body.data;

    expect(totalEvaluated).toBe(4);
    expect(totalQualified).toBe(1);
    expect(qualifiedMatches.length).toBe(1);

    // Exact match offer
    const topMatch = qualifiedMatches[0];
    expect(topMatch.isCompatible).toBe(true);
    expect(topMatch.requiresSubstitutionApproval).toBe(false);
    expect(topMatch.confidenceScore).toBeGreaterThanOrEqual(0.9);

    // Check filtered-out list contains:
    // - Expired quote (Stage 1)
    // - Mumbai delivery area (Stage 1)
    // - 8-oz Polystyrene Cup (Stage 2 specification mismatch)
    expect(filteredOutOffers.length).toBe(3);

    const reasons = filteredOutOffers.map((f) => f.rejectionReason).join(" ");
    expect(reasons).toMatch(/expired/i);
    expect(reasons).toMatch(/delivery area.*LUCKNOW/i);
    expect(reasons).toMatch(/material|capacity/i);
  });

  it("GET /api/requirements/:id/matches blocks access to another shop's requirement (403 Forbidden)", async () => {
    // Switch currentUser to User B (Shop B)
    currentUser = {
      _id: userBId,
      shopId: shopBId,
      role: "SHOP_OWNER",
    };

    const res = await request(testApp).get(`/api/requirements/${confirmedReq._id}/matches`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Access denied/i);
  });
});
