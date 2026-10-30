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

describe("Authentication & RBAC Integration Tests (PRK-03)", () => {
  const validShopOwnerPayload = {
    name: "Ramesh Gupta",
    email: "ramesh.gupta@kirana.com",
    password: "SecurePassword123!",
    role: "SHOP_OWNER",
    shopDetails: {
      name: "Gupta General Store",
      businessType: "KIRANA_RETAIL",
      deliveryArea: "Hazratganj, Lucknow",
      deliveryAddress: {
        street: "Shop 12, Main Market",
        city: "Lucknow",
        state: "Uttar Pradesh",
        postalCode: "226001",
        country: "IN",
      },
      contactDetails: {
        phone: "+91-9876543210",
        gstin: "09AAACG1234F1Z5",
      },
      preferredCurrency: "INR",
    },
  };

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Registration Tests
  // ───────────────────────────────────────────────────────────────────────────
  describe("POST /api/auth/register", () => {
    it("registers a new retail shop owner and creates both User and Shop records atomically", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send(validShopOwnerPayload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("token");
      expect(res.body.data.user).toHaveProperty("email", "ramesh.gupta@kirana.com");
      expect(res.body.data.user).toHaveProperty("role", "SHOP_OWNER");
      expect(res.body.data.user).not.toHaveProperty("passwordHash");

      // Verify Shop was created and linked
      expect(res.body.data.shop).toBeDefined();
      expect(res.body.data.shop.name).toBe("Gupta General Store");
      expect(res.body.data.shop.deliveryArea).toBe("Hazratganj, Lucknow");

      // Verify cookie was set
      expect(res.headers["set-cookie"]).toBeDefined();

      // Check database state
      const dbUser = await User.findOne({ email: "ramesh.gupta@kirana.com" });
      expect(dbUser).not.toBeNull();
      const dbShop = await Shop.findOne({ ownerUserId: dbUser._id });
      expect(dbShop).not.toBeNull();
      expect(dbShop.name).toBe("Gupta General Store");
    });

    it("rejects duplicate email with 409 Conflict", async () => {
      // First registration
      await request(app).post("/api/auth/register").send(validShopOwnerPayload);

      // Attempt duplicate registration
      const res = await request(app)
        .post("/api/auth/register")
        .send(validShopOwnerPayload);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toContain("DUPLICATE_EMAIL");
    });

    it("rejects registration when required fields are missing", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({ email: "incomplete@test.com" });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it("rejects retailer registration when shopDetails are missing", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({
          name: "Retailer Without Shop",
          email: "noshop@test.com",
          password: "password123",
          role: "SHOP_OWNER",
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Login Tests
  // ───────────────────────────────────────────────────────────────────────────
  describe("POST /api/auth/login", () => {
    beforeEach(async () => {
      // Seed user
      await request(app).post("/api/auth/register").send(validShopOwnerPayload);
    });

    it("logs in with valid credentials and returns safe user, shop, and JWT", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({
          email: "ramesh.gupta@kirana.com",
          password: "SecurePassword123!",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("token");
      expect(res.body.data.user.email).toBe("ramesh.gupta@kirana.com");
      expect(res.body.data.user).not.toHaveProperty("passwordHash");
      expect(res.body.data.shop.name).toBe("Gupta General Store");
    });

    it("rejects wrong password with 401 and INVALID_CREDENTIALS", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({
          email: "ramesh.gupta@kirana.com",
          password: "WrongPassword123!",
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toContain("INVALID_CREDENTIALS");
    });

    it("rejects non-existent email with 401 and INVALID_CREDENTIALS", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({
          email: "nobody@nowhere.com",
          password: "SomePassword123!",
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toContain("INVALID_CREDENTIALS");
    });

    it("rejects disabled account with 403 and ACCOUNT_DISABLED", async () => {
      await User.updateOne(
        { email: "ramesh.gupta@kirana.com" },
        { status: "DISABLED" }
      );

      const res = await request(app)
        .post("/api/auth/login")
        .send({
          email: "ramesh.gupta@kirana.com",
          password: "SecurePassword123!",
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toContain("ACCOUNT_DISABLED");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Authenticated Session & Current User (/me)
  // ───────────────────────────────────────────────────────────────────────────
  describe("GET /api/auth/me", () => {
    let token;

    beforeEach(async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send(validShopOwnerPayload);
      token = res.body.data.token;
    });

    it("returns current user and linked shop when authenticated via Bearer token", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe("ramesh.gupta@kirana.com");
      expect(res.body.data.shop.name).toBe("Gupta General Store");
    });

    it("returns 401 when Authorization token is missing", async () => {
      const res = await request(app).get("/api/auth/me");
      expect(res.status).toBe(401);
      expect(res.body.errors).toContain("MISSING_AUTH_TOKEN");
    });

    it("returns 401 when token is tampered/invalid", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", "Bearer invalid-garbage-token");

      expect(res.status).toBe(401);
      expect(res.body.errors).toContain("INVALID_TOKEN");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Logout Tests
  // ───────────────────────────────────────────────────────────────────────────
  describe("POST /api/auth/logout", () => {
    it("clears authentication cookie and removes refreshToken from database", async () => {
      const reg = await request(app)
        .post("/api/auth/register")
        .send(validShopOwnerPayload);

      const res = await request(app)
        .post("/api/auth/logout")
        .set("Authorization", `Bearer ${reg.body.data.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const user = await User.findOne({ email: "ramesh.gupta@kirana.com" }).select("+refreshToken");
      expect(user.refreshToken).toBeUndefined();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Refresh Token Flow
  // ───────────────────────────────────────────────────────────────────────────
  describe("POST /api/auth/refresh-token", () => {
    it("rotates and returns new access and refresh tokens when valid refreshToken is provided", async () => {
      const reg = await request(app)
        .post("/api/auth/register")
        .send(validShopOwnerPayload);

      const oldRefreshToken = reg.body.data.refreshToken;
      expect(oldRefreshToken).toBeDefined();

      const res = await request(app)
        .post("/api/auth/refresh-token")
        .send({ refreshToken: oldRefreshToken });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("accessToken");
      expect(res.body.data).toHaveProperty("refreshToken");
      expect(res.body.data.refreshToken).not.toBe(oldRefreshToken);
    });

    it("rejects invalid or tampered refresh token with 401", async () => {
      const res = await request(app)
        .post("/api/auth/refresh-token")
        .send({ refreshToken: "invalid.fake.token" });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Change Password Flow
  // ───────────────────────────────────────────────────────────────────────────
  describe("POST /api/auth/change-password", () => {
    it("changes password successfully when old password is correct", async () => {
      const reg = await request(app)
        .post("/api/auth/register")
        .send(validShopOwnerPayload);

      const token = reg.body.data.accessToken;

      const res = await request(app)
        .post("/api/auth/change-password")
        .set("Authorization", `Bearer ${token}`)
        .send({
          oldPassword: "SecurePassword123!",
          newPassword: "BrandNewSecurePassword456!",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify login with new password works
      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({
          email: "ramesh.gupta@kirana.com",
          password: "BrandNewSecurePassword456!",
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.success).toBe(true);
    });

    it("rejects password change if old password is incorrect", async () => {
      const reg = await request(app)
        .post("/api/auth/register")
        .send(validShopOwnerPayload);

      const res = await request(app)
        .post("/api/auth/change-password")
        .set("Authorization", `Bearer ${reg.body.data.accessToken}`)
        .send({
          oldPassword: "WrongPassword999!",
          newPassword: "BrandNewSecurePassword456!",
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("Old password is incorrect");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. Forgot & Reset Password Flow
  // ───────────────────────────────────────────────────────────────────────────
  describe("POST /api/auth/forgot-password & /api/auth/reset-password", () => {
    it("generates OTP and resets password successfully", async () => {
      await request(app).post("/api/auth/register").send(validShopOwnerPayload);

      const forgotRes = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: "ramesh.gupta@kirana.com" });

      expect(forgotRes.status).toBe(200);
      expect(forgotRes.body.success).toBe(true);

      // Retrieve generated OTP directly from database to simulate email delivery
      const user = await User.findOne({ email: "ramesh.gupta@kirana.com" }).select("+forgotPasswordOtp");
      expect(user.forgotPasswordOtp).toBeDefined();

      const resetRes = await request(app)
        .post("/api/auth/reset-password")
        .send({
          email: "ramesh.gupta@kirana.com",
          otp: user.forgotPasswordOtp,
          newPassword: "ResetPasswordSuccess789!",
        });

      expect(resetRes.status).toBe(200);
      expect(resetRes.body.success).toBe(true);

      // Verify login with reset password works
      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({
          email: "ramesh.gupta@kirana.com",
          password: "ResetPasswordSuccess789!",
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.success).toBe(true);
    });
  });
});
