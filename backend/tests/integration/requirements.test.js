import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import express from "express";

import { Requirement } from "../../src/models/Requirement.model.js";
import "../../src/models/UploadedDocument.model.js";
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

describe("Purchasing Requirement Model, CRUD & CSV Import Integration Tests (SAH-02)", () => {
  const shopAId = new mongoose.Types.ObjectId("111111111111111111111111");
  const shopBId = new mongoose.Types.ObjectId("222222222222222222222222");
  const userAId = new mongoose.Types.ObjectId("aaaaaaaaaaaaaaaaaaaaaaaa");
  const userBId = new mongoose.Types.ObjectId("bbbbbbbbbbbbbbbbbbbbbbbb");

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
    await Requirement.deleteMany({});
    currentUser = {
      _id: userAId,
      shopId: shopAId,
      role: "SHOP_OWNER",
    };
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Requirement Draft Creation & Listing
  // ───────────────────────────────────────────────────────────────────────────
  describe("Requirement Creation & Retrieval (POST / & GET /)", () => {
    it("creates a draft requirement with unverified extractedFields", async () => {
      const res = await request(testApp)
        .post("/api/requirements")
        .send({
          originalDescription: "We need 25 boxes of disposable tea cups for our cafe in Lucknow",
          sourceType: "FORM",
          extractedFields: {
            productName: "Disposable Tea Cups",
            category: "PACKAGING",
            requestedQuantity: 25,
            quantityUnit: "BOX",
            deliveryArea: "LUCKNOW",
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("DRAFT");
      expect(res.body.data.extractedFields.productName).toBe("Disposable Tea Cups");
      expect(res.body.data.shopId).toBe(shopAId.toString());

      // Top-level indexed fields should not be confirmed yet
      expect(res.body.data.confirmedAt).toBeNull();
    });

    it("lists requirements filtered by status and shop scope", async () => {
      // Create one DRAFT and one CONFIRMED requirement
      await Requirement.create([
        {
          shopId: shopAId,
          createdByUserId: userAId,
          sourceType: "FORM",
          status: "DRAFT",
          originalDescription: "Draft 1",
        },
        {
          shopId: shopAId,
          createdByUserId: userAId,
          sourceType: "FORM",
          status: "NEEDS_REVIEW",
          originalDescription: "Needs Review 1",
        },
      ]);

      const res = await request(testApp).get("/api/requirements?status=DRAFT");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.requirements.length).toBe(1);
      expect(res.body.data.requirements[0].originalDescription).toBe("Draft 1");
    });

    it("retrieves a requirement by ID", async () => {
      const doc = await Requirement.create({
        shopId: shopAId,
        createdByUserId: userAId,
        sourceType: "TEXT",
        originalDescription: "Sample item",
        status: "DRAFT",
      });

      const res = await request(testApp).get(`/api/requirements/${doc._id}`);

      expect(res.status).toBe(200);
      expect(res.body.data._id).toBe(doc._id.toString());
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Strict Enforcement of Business Rule BR-001 (Confirmation Guardrails)
  // ───────────────────────────────────────────────────────────────────────────
  describe("Business Rule BR-001 Confirmation Validation (PATCH /:id)", () => {
    let draftRequirement;

    beforeEach(async () => {
      draftRequirement = await Requirement.create({
        shopId: shopAId,
        createdByUserId: userAId,
        sourceType: "FORM",
        originalDescription: "Looking for wholesale takeout containers",
        status: "DRAFT",
      });
    });

    it("rejects confirmation when productName is missing (400 Bad Request)", async () => {
      const res = await request(testApp)
        .patch(`/api/requirements/${draftRequirement._id}`)
        .send({
          status: "CONFIRMED",
          confirmedFields: {
            category: "PACKAGING",
            requestedQuantity: 50,
            quantityUnit: "BOX",
            deliveryArea: "DELHI_NCR",
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/BR-001.*productName/i);
    });

    it("rejects confirmation when category is missing (400 Bad Request)", async () => {
      const res = await request(testApp)
        .patch(`/api/requirements/${draftRequirement._id}`)
        .send({
          status: "CONFIRMED",
          confirmedFields: {
            productName: "12-oz Cups",
            requestedQuantity: 50,
            quantityUnit: "BOX",
            deliveryArea: "DELHI_NCR",
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/BR-001.*category/i);
    });

    it("rejects confirmation when requestedQuantity is non-integer or <= 0", async () => {
      // Test negative quantity
      const resNegative = await request(testApp)
        .patch(`/api/requirements/${draftRequirement._id}`)
        .send({
          status: "CONFIRMED",
          confirmedFields: {
            productName: "12-oz Cups",
            category: "PACKAGING",
            requestedQuantity: -10,
            quantityUnit: "BOX",
            deliveryArea: "DELHI_NCR",
          },
        });
      expect(resNegative.status).toBe(400);
      expect(resNegative.body.message).toMatch(/positive integer/i);

      // Test fractional quantity (e.g. 12.5)
      const resFraction = await request(testApp)
        .patch(`/api/requirements/${draftRequirement._id}`)
        .send({
          status: "CONFIRMED",
          confirmedFields: {
            productName: "12-oz Cups",
            category: "PACKAGING",
            requestedQuantity: 12.5,
            quantityUnit: "BOX",
            deliveryArea: "DELHI_NCR",
          },
        });
      expect(resFraction.status).toBe(400);
      expect(resFraction.body.message).toMatch(/positive integer/i);
    });

    it("rejects confirmation when quantityUnit or deliveryArea is missing", async () => {
      const resMissingUnit = await request(testApp)
        .patch(`/api/requirements/${draftRequirement._id}`)
        .send({
          status: "CONFIRMED",
          confirmedFields: {
            productName: "12-oz Cups",
            category: "PACKAGING",
            requestedQuantity: 20,
            deliveryArea: "DELHI_NCR",
          },
        });
      expect(resMissingUnit.status).toBe(400);
      expect(resMissingUnit.body.message).toMatch(/quantityUnit/i);

      const resMissingArea = await request(testApp)
        .patch(`/api/requirements/${draftRequirement._id}`)
        .send({
          status: "CONFIRMED",
          confirmedFields: {
            productName: "12-oz Cups",
            category: "PACKAGING",
            requestedQuantity: 20,
            quantityUnit: "BOX",
          },
        });
      expect(resMissingArea.status).toBe(400);
      expect(resMissingArea.body.message).toMatch(/deliveryArea/i);
    });

    it("successfully confirms requirement when all 5 fields are present & syncs top-level indexed fields", async () => {
      const validConfirmedFields = {
        productName: "12-oz Food-Safe Paper Cups",
        category: "PACKAGING",
        requestedQuantity: 25,
        quantityUnit: "BOX",
        deliveryArea: "LUCKNOW",
        packSize: "1000 cups / box",
      };

      const res = await request(testApp)
        .patch(`/api/requirements/${draftRequirement._id}`)
        .send({
          status: "CONFIRMED",
          confirmedFields: validConfirmedFields,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("CONFIRMED");
      expect(res.body.data.confirmedAt).not.toBeNull();
      expect(res.body.data.confirmedByUserId).toBe(userAId.toString());

      // Verify flattened properties are synchronized for fast catalogue indexing
      expect(res.body.data.productName).toBe("12-oz Food-Safe Paper Cups");
      expect(res.body.data.category).toBe("PACKAGING");
      expect(res.body.data.requestedQuantity).toBe(25);
      expect(res.body.data.quantityUnit).toBe("BOX");
      expect(res.body.data.deliveryArea).toBe("LUCKNOW");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Ownership Access Guard
  // ───────────────────────────────────────────────────────────────────────────
  describe("Ownership Access Guard", () => {
    it("blocks a shop owner from editing another shop's requirement (403 Forbidden)", async () => {
      const shopBRequirement = await Requirement.create({
        shopId: shopBId,
        createdByUserId: userBId,
        sourceType: "FORM",
        originalDescription: "Shop B requirement",
        status: "DRAFT",
      });

      // User A (Shop A) attempts to edit Shop B's requirement
      const res = await request(testApp)
        .patch(`/api/requirements/${shopBRequirement._id}`)
        .send({
          originalDescription: "Attempted unauthorized edit",
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Access denied/i);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Bulk CSV Import (POST /import-csv)
  // ───────────────────────────────────────────────────────────────────────────
  describe("Bulk CSV Import (POST /api/requirements/import-csv)", () => {
    it("bulk imports valid requirements from CSV payload and saves as DRAFTs", async () => {
      const csvPayload = `productName,category,requestedQuantity,quantityUnit,deliveryArea,packSize
12-oz Paper Cups,PACKAGING,30,BOX,LUCKNOW,1000/box
Corrugated Takeout Boxes,PACKAGING,150,UNIT,LUCKNOW,1 unit
Thermal POS Paper Rolls,PRINTING,50,ROLL,LUCKNOW,50 rolls/case`;

      const res = await request(testApp)
        .post("/api/requirements/import-csv")
        .send({ csv: csvPayload });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalImported).toBe(3);

      // Verify records in MongoDB
      const docsInDb = await Requirement.find({ shopId: shopAId, sourceType: "CSV" });
      expect(docsInDb.length).toBe(3);
      expect(docsInDb.every((doc) => doc.status === "DRAFT")).toBe(true);

      const firstDoc = docsInDb.find((d) => d.confirmedFields.productName === "12-oz Paper Cups");
      expect(firstDoc).toBeDefined();
      expect(firstDoc.confirmedFields.requestedQuantity).toBe(30);
      expect(firstDoc.confirmedFields.quantityUnit).toBe("BOX");
      expect(firstDoc.confirmedFields.deliveryArea).toBe("LUCKNOW");
    });

    it("rejects empty CSV with 400 Bad Request", async () => {
      const res = await request(testApp)
        .post("/api/requirements/import-csv")
        .send({ csv: "   " });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});

