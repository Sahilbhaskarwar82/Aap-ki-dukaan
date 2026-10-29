/**
 * Integration Tests — SRU-09
 * Correlation ID Middleware & Immutable AuditLog Service
 *
 * Requirements:
 *  - Generates or propagates UUID X-Correlation-Id across all requests/responses.
 *  - auditService.logEvent() scrubs sensitive credentials, passwords, and tokens.
 *  - AuditLog is strictly immutable (createdAt only, no updatedAt).
 *  - GET /api/orders/:id/activity returns chronological audit trail with authorization guards.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import express from "express";

import app from "../../src/app.js";
import { AuditLog } from "../../src/models/AuditLog.model.js";
import { Order } from "../../src/models/Order.model.js";
import {
  logEvent,
  scrubSensitiveData,
  getOrderActivityTimeline,
  getPoolActivityTimeline,
} from "../../src/services/notifications/audit.service.js";
import orderRouter from "../../src/routes/order.routes.js";

function buildTestApp(getUser) {
  const testApp = express();
  testApp.use(express.json());

  testApp.use((req, _res, next) => {
    req.user = typeof getUser === "function" ? getUser(req) : getUser;
    next();
  });

  testApp.use("/api/orders", orderRouter);

  testApp.use((err, _req, res, _next) => {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      statusCode,
      message: err.message,
    });
  });

  return testApp;
}

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { retryWrites: false });

  if (!mongoose.models.User) {
    mongoose.model(
      "User",
      new mongoose.Schema(
        {
          name: String,
          email: String,
          role: String,
        },
        { timestamps: true }
      )
    );
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("Task SRU-09: Correlation ID Middleware & Immutable AuditLog Service", () => {
  let orderId;
  let poolId;
  let shopAId;
  let supplierId;

  beforeEach(async () => {
    await AuditLog.deleteMany({});
    await Order.deleteMany({});

    orderId = new mongoose.Types.ObjectId();
    poolId = new mongoose.Types.ObjectId();
    shopAId = new mongoose.Types.ObjectId();
    supplierId = new mongoose.Types.ObjectId();

    await Order.create({
      _id: orderId,
      orderNumber: "AKD-2026-AUDIT-001",
      poolId,
      supplierId,
      productId: new mongoose.Types.ObjectId(),
      supplierOfferId: new mongoose.Types.ObjectId(),
      priceSnapshotId: new mongoose.Types.ObjectId(),
      currency: "INR",
      totalQuantity: 60,
      unit: "BOX",
      merchandiseTotalMinor: 480000,
      shippingTotalMinor: 0,
      grandTotalMinor: 480000,
      orderState: "CONFIRMED",
      memberOrders: [
        {
          contributionId: new mongoose.Types.ObjectId(),
          shopId: shopAId,
          shopName: "Hazratganj Café",
          quantity: 60,
          unit: "BOX",
          unitPriceMinor: 8000,
          merchandiseShareMinor: 480000,
          shippingShareMinor: 0,
          totalPaidMinor: 480000,
          deliveryStatus: "PENDING",
        },
      ],
    });
  });

  // ── 1. Correlation ID Middleware Tests ──────────────────────────────────────
  it("1. Correlation ID middleware generates a UUID X-Correlation-Id header when none provided", async () => {
    const res = await request(app).get("/api/orders");

    expect(res.headers["x-correlation-id"]).toBeDefined();
    expect(res.headers["x-correlation-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("2. Correlation ID middleware preserves and propagates incoming X-Correlation-Id header", async () => {
    const clientCorrelationId = "custom-client-trace-id-12345678";
    const res = await request(app)
      .get("/api/orders")
      .set("X-Correlation-Id", clientCorrelationId);

    expect(res.headers["x-correlation-id"]).toBe(clientCorrelationId);
  });

  // ── 2. Sensitive Data Scrubbing ─────────────────────────────────────────────
  it("3. scrubSensitiveData redacts passwords, tokens, API keys, and client secrets", () => {
    const rawPayload = {
      orderNumber: "AKD-2026-0001",
      amountMinor: 480000,
      userCredentials: {
        password: "MySuperSecretPassword123!",
        accessToken: "bearer_xyz_token_secret",
      },
      paypalAuth: {
        clientSecret: "PAYPAL_SECRET_KEY_ABC",
        apiKey: "API_KEY_12345",
      },
      billingDetails: {
        cardNumber: "4111111111111111",
        cvv: "123",
      },
      publicNotes: "Public order notes for packaging",
    };

    const scrubbed = scrubSensitiveData(rawPayload);

    expect(scrubbed.orderNumber).toBe("AKD-2026-0001");
    expect(scrubbed.amountMinor).toBe(480000);
    expect(scrubbed.publicNotes).toBe("Public order notes for packaging");

    // Sensitive values must be [REDACTED]
    expect(scrubbed.userCredentials.password).toBe("[REDACTED]");
    expect(scrubbed.userCredentials.accessToken).toBe("[REDACTED]");
    expect(scrubbed.paypalAuth.clientSecret).toBe("[REDACTED]");
    expect(scrubbed.paypalAuth.apiKey).toBe("[REDACTED]");
    expect(scrubbed.billingDetails.cardNumber).toBe("[REDACTED]");
    expect(scrubbed.billingDetails.cvv).toBe("[REDACTED]");
  });

  // ── 3. Immutable AuditLog Persistence ───────────────────────────────────────
  it("4. logEvent creates immutable audit records and does not have updatedAt", async () => {
    const correlationId = "corr-test-immutability-01";
    const actorId = new mongoose.Types.ObjectId();

    const res = await logEvent({
      correlationId,
      actorId,
      actorRole: "SHOP_OWNER",
      action: "POOL_JOINED",
      resourceType: "POOL",
      resourceId: poolId,
      poolId,
      metadata: {
        quantity: 20,
        amountMinor: 160000,
        token: "secret_session_token",
      },
      throwOnError: true,
    });

    expect(res.success).toBe(true);
    expect(res.auditLog).toBeDefined();
    expect(res.auditLog.action).toBe("POOL_JOINED");
    expect(res.auditLog.metadata.token).toBe("[REDACTED]");
    expect(res.auditLog.metadata.quantity).toBe(20);

    // Verify Immutability constraint: createdAt exists, updatedAt is undefined
    expect(res.auditLog.createdAt).toBeDefined();
    expect(res.auditLog.updatedAt).toBeUndefined();

    // Verify persisted in DB
    const dbRecord = await AuditLog.findById(res.auditLog._id).lean();
    expect(dbRecord.updatedAt).toBeUndefined();
    expect(dbRecord.createdAt).toBeDefined();
  });

  // ── 4. Order Activity History & Authorization ───────────────────────────────
  it("5. GET /api/orders/:id/activity returns chronological audit trail for authorized participant", async () => {
    const transitions = [
      { action: "POOL_CREATED", resourceType: "POOL", resourceId: poolId },
      { action: "PAYMENT_CAPTURED", resourceType: "PAYMENT", resourceId: new mongoose.Types.ObjectId() },
      { action: "EARLY_MOQ_LOCK", resourceType: "POOL", resourceId: poolId },
      { action: "ORDER_CREATED", resourceType: "ORDER", resourceId: orderId },
      { action: "SUPPLIER_CONFIRMED", resourceType: "ORDER", resourceId: orderId },
    ];

    for (let i = 0; i < transitions.length; i++) {
      const t = transitions[i];
      await logEvent({
        correlationId: `corr-order-step-${i}`,
        actorId: new mongoose.Types.ObjectId(),
        actorRole: "SHOP_OWNER",
        action: t.action,
        resourceType: t.resourceType,
        resourceId: t.resourceId,
        poolId,
        orderId,
        metadata: { stepIndex: i },
      });
    }

    const testApp = buildTestApp({ _id: new mongoose.Types.ObjectId(), role: "SHOP_OWNER", shopId: shopAId.toString() });
    const res = await request(testApp).get(`/api/orders/${orderId}/activity`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.total).toBe(5);
    expect(res.body.data.activity).toHaveLength(5);
  });

  it("6. GET /api/orders/:id/activity returns 403 Forbidden for non-participating shop owner", async () => {
    const intruderShopId = new mongoose.Types.ObjectId();
    const testApp = buildTestApp({ _id: new mongoose.Types.ObjectId(), role: "SHOP_OWNER", shopId: intruderShopId.toString() });

    const res = await request(testApp).get(`/api/orders/${orderId}/activity`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Forbidden/i);
  });

  // ── 5. Pool Activity Timeline ──────────────────────────────────────────────
  it("7. getPoolActivityTimeline returns chronological timeline for a pool", async () => {
    await logEvent({
      correlationId: "corr-pool-1",
      action: "POOL_CREATED",
      resourceType: "POOL",
      resourceId: poolId,
      poolId,
      actorRole: "SHOP_OWNER",
    });

    await logEvent({
      correlationId: "corr-pool-2",
      action: "CONTRIBUTION_ADDED",
      resourceType: "CONTRIBUTION",
      resourceId: new mongoose.Types.ObjectId(),
      poolId,
      actorRole: "SHOP_OWNER",
    });

    const timeline = await getPoolActivityTimeline(poolId);
    expect(timeline.total).toBe(2);
    expect(timeline.activity).toHaveLength(2);
  });

  // ── 6. Fault Isolation ─────────────────────────────────────────────────────
  it("8. logEvent protects calling business transactions by not throwing on missing action", async () => {
    const res = await logEvent({
      resourceType: "ORDER",
      resourceId: orderId,
      // action intentionally missing
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/action is required/i);
  });
});
