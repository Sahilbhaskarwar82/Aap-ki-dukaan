import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import fsp from "node:fs/promises";

import { UploadedDocument } from "../../src/models/UploadedDocument.model.js";
import uploadRouter from "../../src/routes/upload.routes.js";
import { PRIVATE_UPLOAD_DIR } from "../../src/middleware/upload.middleware.js";

let mongoServer;
let testApp;
let currentUser = null;

function buildApp() {
  const app = express();
  app.use(express.json());

  app.use((req, _res, next) => {
    req.user = currentUser;
    next();
  });

  app.use("/api/uploads", uploadRouter);

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

describe("Document Upload & Private Storage Integration Tests (SAH-01)", () => {
  const shopAId = new mongoose.Types.ObjectId("111111111111111111111111");
  const shopBId = new mongoose.Types.ObjectId("222222222222222222222222");
  const userAId = new mongoose.Types.ObjectId("aaaaaaaaaaaaaaaaaaaaaaaa");
  const userBId = new mongoose.Types.ObjectId("bbbbbbbbbbbbbbbbbbbbbbbb");

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    testApp = buildApp();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await UploadedDocument.deleteMany({});
    currentUser = {
      _id: userAId,
      shopId: shopAId,
      role: "SHOP_OWNER",
    };
  });

  it("1. Successfully uploads a valid PDF document with integrity hash & retention date", async () => {
    // Valid minimal PDF header
    const validPdfBuffer = Buffer.from("%PDF-1.4\n% minimal valid pdf test buffer\n%%EOF");

    const res = await request(testApp)
      .post("/api/uploads")
      .attach("document", validPdfBuffer, "invoice_june.pdf");

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("_id");
    expect(res.body.data.originalFilename).toBe("invoice_june.pdf");
    expect(res.body.data.mimeType).toBe("application/pdf");
    expect(res.body.data.status).toBe("STORED");
    expect(res.body.data.sha256Hash).toBeDefined();
    expect(res.body.data.retentionExpiresAt).toBeDefined();

    // Verify record in MongoDB
    const docInDb = await UploadedDocument.findById(res.body.data._id);
    expect(docInDb).not.toBeNull();
    expect(docInDb.storageKey).toMatch(/\.pdf$/);

    // Verify file exists in private storage directory
    const storedFilePath = path.join(PRIVATE_UPLOAD_DIR, docInDb.storageKey);
    expect(fs.existsSync(storedFilePath)).toBe(true);

    // Clean up
    await fsp.unlink(storedFilePath).catch(() => {});
  });

  it("2. Successfully uploads a valid PNG image document", async () => {
    // Valid PNG signature: 89 50 4E 47 0D 0A 1A 0A
    const validPngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52
    ]);

    const res = await request(testApp)
      .post("/api/uploads")
      .attach("document", validPngBuffer, "receipt.png");

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.mimeType).toBe("image/png");

    // Clean up
    const docInDb = await UploadedDocument.findById(res.body.data._id);
    if (docInDb) {
      await fsp.unlink(path.join(PRIVATE_UPLOAD_DIR, docInDb.storageKey)).catch(() => {});
    }
  });

  it("3. Rejects dangerous executable (.exe / .js) files with 400 Bad Request", async () => {
    const maliciousBuffer = Buffer.from("malicious script payload");

    const res = await request(testApp)
      .post("/api/uploads")
      .attach("document", maliciousBuffer, "payload.exe");

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Security violation|prohibited/i);
  });

  it("4. Rejects spoofed files (magic-byte mismatch: text file disguised as PDF)", async () => {
    // Non-PDF text content pretending to be PDF
    const spoofedBuffer = Buffer.from("This is plain text without PDF header");

    const res = await request(testApp)
      .post("/api/uploads")
      .set("Content-Type", "multipart/form-data")
      .attach("document", spoofedBuffer, {
        filename: "spoofed.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/signature does not match/i);
  });

  it("5. Rejects files exceeding the 10MB limit with 400 Bad Request", async () => {
    // 10.5 MB buffer
    const oversizedBuffer = Buffer.alloc(10.5 * 1024 * 1024, 0);

    const res = await request(testApp)
      .post("/api/uploads")
      .attach("document", oversizedBuffer, "large_invoice.pdf");

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/10MB/i);
  });

  it("6. Allows document owner to download stored file", async () => {
    const validPdfBuffer = Buffer.from("%PDF-1.4\n% valid document stream\n%%EOF");

    const uploadRes = await request(testApp)
      .post("/api/uploads")
      .attach("document", validPdfBuffer, "tax_invoice.pdf");

    const docId = uploadRes.body.data._id;

    // Current user is User A (owner)
    const downloadRes = await request(testApp).get(`/api/uploads/${docId}/download`);

    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers["content-type"]).toBe("application/pdf");
    expect(downloadRes.headers["content-disposition"]).toMatch(/tax_invoice\.pdf/);

    // Clean up
    const docInDb = await UploadedDocument.findById(docId);
    if (docInDb) {
      await fsp.unlink(path.join(PRIVATE_UPLOAD_DIR, docInDb.storageKey)).catch(() => {});
    }
  });

  it("7. Blocks unauthorized users from downloading another shop's document (403 Forbidden)", async () => {
    const validPdfBuffer = Buffer.from("%PDF-1.4\n% private shop invoice\n%%EOF");

    const uploadRes = await request(testApp)
      .post("/api/uploads")
      .attach("document", validPdfBuffer, "private_doc.pdf");

    const docId = uploadRes.body.data._id;

    // Switch active user to User B (different shop, not admin)
    currentUser = {
      _id: userBId,
      shopId: shopBId,
      role: "SHOP_OWNER",
    };

    const downloadRes = await request(testApp).get(`/api/uploads/${docId}/download`);

    expect(downloadRes.status).toBe(403);
    expect(downloadRes.body.success).toBe(false);
    expect(downloadRes.body.message).toMatch(/Forbidden|permission/i);

    // Clean up
    const docInDb = await UploadedDocument.findById(docId);
    if (docInDb) {
      await fsp.unlink(path.join(PRIVATE_UPLOAD_DIR, docInDb.storageKey)).catch(() => {});
    }
  });
});

