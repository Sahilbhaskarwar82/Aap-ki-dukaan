import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import app from "../../src/app.js";
import { User } from "../../src/models/User.model.js";
import { Shop } from "../../src/models/Shop.model.js";

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { retryWrites: false });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await Shop.deleteMany({});
});

describe("Shop Business Profile & Ownership Guard Integration Tests (PRK-04)", () => {
  let shopAOwnerToken, shopAId;
  let shopBOwnerToken, shopBId;
  let adminToken;

  beforeEach(async () => {
    // 1. Register Shop A (Retailer A)
    const resA = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Shop Owner A",
        email: "ownerA@shop.com",
        password: "Password123!",
        role: "SHOP_OWNER",
        shopDetails: {
          name: "Kirana Store A",
          deliveryArea: "Lucknow North",
          deliveryAddress: { city: "Lucknow", state: "UP", postalCode: "226001" },
        },
      });
    shopAOwnerToken = resA.body.data.token;
    shopAId = resA.body.data.shop._id;

    // 2. Register Shop B (Retailer B)
    const resB = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Shop Owner B",
        email: "ownerB@shop.com",
        password: "Password123!",
        role: "SHOP_OWNER",
        shopDetails: {
          name: "Kirana Store B",
          deliveryArea: "Lucknow South",
          deliveryAddress: { city: "Lucknow", state: "UP", postalCode: "226002" },
        },
      });
    shopBOwnerToken = resB.body.data.token;
    shopBId = resB.body.data.shop._id;

    // 3. Register Admin User
    const resAdmin = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Platform Admin",
        email: "admin@cobuy.ai",
        password: "AdminPassword123!",
        role: "ADMIN",
      });
    adminToken = resAdmin.body.data.token;
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. GET /api/shops/me
  // ───────────────────────────────────────────────────────────────────────────
  describe("GET /api/shops/me", () => {
    it("returns authenticated retailer's own shop profile", async () => {
      const res = await request(app)
        .get("/api/shops/me")
        .set("Authorization", `Bearer ${shopAOwnerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data._id).toBe(shopAId);
      expect(res.body.data.name).toBe("Kirana Store A");
    });

    it("rejects unauthenticated requests with 401", async () => {
      const res = await request(app).get("/api/shops/me");
      expect(res.status).toBe(401);
      expect(res.body.errors).toContain("MISSING_AUTH_TOKEN");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. PATCH /api/shops/me
  // ───────────────────────────────────────────────────────────────────────────
  describe("PATCH /api/shops/me", () => {
    it("updates permitted profile fields and persists to MongoDB", async () => {
      const updatePayload = {
        name: "Gupta Supermart & Kirana",
        businessType: "SUPERMARKET",
        deliveryArea: "Gomti Nagar, Lucknow",
        contactDetails: {
          phone: "+91-9999988888",
          whatsapp: "+91-9999988888",
          gstin: "09ABCDE1234F1Z9",
        },
        preferredCurrency: "INR",
      };

      const res = await request(app)
        .patch("/api/shops/me")
        .set("Authorization", `Bearer ${shopAOwnerToken}`)
        .send(updatePayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe("Gupta Supermart & Kirana");
      expect(res.body.data.businessType).toBe("SUPERMARKET");
      expect(res.body.data.deliveryArea).toBe("Gomti Nagar, Lucknow");
      expect(res.body.data.contactDetails.gstin).toBe("09ABCDE1234F1Z9");

      // Verify in MongoDB
      const dbShop = await Shop.findById(shopAId);
      expect(dbShop.name).toBe("Gupta Supermart & Kirana");
      expect(dbShop.businessType).toBe("SUPERMARKET");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. GET /api/shops/:shopId (Ownership & Cross-Shop Isolation Guard)
  // ───────────────────────────────────────────────────────────────────────────
  describe("GET /api/shops/:shopId (Ownership Guard)", () => {
    it("allows a shop owner to inspect their own shop", async () => {
      const res = await request(app)
        .get(`/api/shops/${shopAId}`)
        .set("Authorization", `Bearer ${shopAOwnerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data._id).toBe(shopAId);
    });

    it("STRICT GUARD: rejects Shop A trying to inspect Shop B's profile with 403 Forbidden", async () => {
      const res = await request(app)
        .get(`/api/shops/${shopBId}`)
        .set("Authorization", `Bearer ${shopAOwnerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toContain("SHOP_ACCESS_FORBIDDEN");
    });

    it("allows platform ADMIN to inspect any shop profile", async () => {
      const res = await request(app)
        .get(`/api/shops/${shopBId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data._id).toBe(shopBId);
      expect(res.body.data.name).toBe("Kirana Store B");
    });

    it("returns 404 for non-existent shop ID", async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/shops/${nonExistentId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.errors).toContain("SHOP_NOT_FOUND");
    });
  });
});
