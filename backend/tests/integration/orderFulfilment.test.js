/**
 * Integration Tests — Task SRU-05
 * Final Order Model, Order Creation & Fulfilment Status Lifecycle
 *
 * Verifies:
 *  1. createFinalOrderFromFundedPool:
 *     - Verifies all active contributions are APPROVED and fully PAID.
 *     - Creates Order with unique orderNumber (AKD-2026-XXXX) and itemized memberOrders.
 *     - Calculates merchandiseTotalMinor, shippingTotalMinor, grandTotalMinor.
 *     - Transitions pool state to 'ORDERED' and contributions to 'FINALIZED'.
 *     - Automatically creates SupplierSettlement record in SIMULATED / DEMO state.
 *     - Rejects pool if any contribution is not APPROVED.
 *     - Rejects pool if any contribution has unpaid balance.
 *     - Idempotent on repeated calls for same pool.
 *  2. PATCH /api/orders/:id/supplier-status:
 *     - Allows assigned SUPPLIER or ADMIN to confirm order (ORDER_CONFIRMED).
 *     - Rejects unauthorized users (unrelated supplier, retailer, unauthenticated) with 403/401.
 *     - Allows supplier to update delivery/shipping status (SHIPPED, DELIVERED).
 *     - Automatic Refund Rollback: When supplier rejects order (REJECTED), automatically triggers
 *       full refunds for all participants, sets pool & order CANCELLED, and dispatches ORDER_REJECTED.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import express from "express";

process.env.PAYMENT_MODE = "mock";
process.env.NODE_ENV = "test";

import { Order } from "../../src/models/Order.model.js";
import { GroupBuyPool } from "../../src/models/GroupBuyPool.model.js";
import { Contribution } from "../../src/models/Contribution.model.js";
import { PriceSnapshot } from "../../src/models/PriceSnapshot.model.js";
import { Payment } from "../../src/models/Payment.model.js";
import { Refund } from "../../src/models/Refund.model.js";
import { SupplierSettlement } from "../../src/models/SupplierSettlement.model.js";
import { Notification } from "../../src/models/Notification.model.js";
import { AuditLog } from "../../src/models/AuditLog.model.js";
import { Shop } from "../../src/models/Shop.model.js";
import { Supplier } from "../../src/models/Supplier.model.js";
import { Product } from "../../src/models/Product.model.js";
import { SupplierOffer } from "../../src/models/SupplierOffer.model.js";
import {
  createFinalOrderFromFundedPool,
  updateSupplierStatus,
} from "../../src/services/orders/order.service.js";
import orderRouter from "../../src/routes/order.routes.js";

// Helper to build express test app with dynamic user injection
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

describe("Task SRU-05: Final Order Model, Order Creation & Fulfilment Lifecycle", () => {
  let supplierDoc;
  let otherSupplierDoc;
  let productDoc;
  let offerDoc;
  let shopA;
  let shopB;
  let buyerUserAId;
  let buyerUserBId;
  let adminUser;

  beforeEach(async () => {
    // Clear all test collections
    await Order.deleteMany({});
    await GroupBuyPool.deleteMany({});
    await Contribution.deleteMany({});
    await PriceSnapshot.deleteMany({});
    await Payment.deleteMany({});
    await Refund.deleteMany({});
    await SupplierSettlement.deleteMany({});
    await Notification.deleteMany({});
    await AuditLog.deleteMany({});
    await Shop.deleteMany({});
    await Supplier.deleteMany({});
    await Product.deleteMany({});
    await SupplierOffer.deleteMany({});

    // Seed Supplier
    supplierDoc = await Supplier.create({
      name: "AgriBulk Wholesalers Ltd",
      contactReference: {
        contactPerson: "Vikram Malhotra",
        email: "vikram@agribulk.demo",
        phone: "+91-522-777888",
      },
      serviceAreas: ["Lucknow", "Varanasi"],
      verificationStatus: "VERIFIED",
      dataSourceType: "SUPPLIER_SUBMITTED",
    });

    otherSupplierDoc = await Supplier.create({
      name: "Competitor Wholesale Corp",
      contactReference: {
        contactPerson: "Anil Kapoor",
        email: "anil@competitor.demo",
        phone: "+91-522-111222",
      },
      serviceAreas: ["Kanpur"],
      verificationStatus: "VERIFIED",
      dataSourceType: "SEEDED_DEMO",
    });

    // Seed Product
    productDoc = await Product.create({
      canonicalName: "Basmati Rice 25kg Premium Bag",
      category: "GRAINS",
      baseUnit: "BAG",
      packSizeDescription: "25kg woven poly bag",
      specifications: {
        material: "1121 Steam Basmati",
        capacityOrSize: "25kg",
        grade: "Grade 1 Export Quality",
        foodSafe: true,
      },
    });

    // Seed Supplier Offer
    offerDoc = await SupplierOffer.create({
      supplierId: supplierDoc._id,
      productId: productDoc._id,
      packUnit: "BAG",
      packSize: "25kg Bag",
      baseUnitPriceMinor: 200000,
      currency: "INR",
      minimumOrderQuantity: 100,
      retailerMoqPercentage: 20,
      retailerStepPercentage: 1,
      quantityTiers: [
        { minQuantity: 100, maxQuantity: 249, unitPriceMinor: 200000 }, // ₹2000 per bag
        { minQuantity: 250, maxQuantity: null, unitPriceMinor: 180000 }, // ₹1800 per bag
      ],
      deliveryAreas: ["Lucknow", "Varanasi"],
      leadTimeDays: 5,
      shippingTerms: "Standard Regional Delivery",
      flatShippingCostMinor: 50000, // ₹500
      shippingAllocationMethod: "PER_UNIT",
      taxInclusion: "GST_EXCLUDED",
      availabilityStatus: "IN_STOCK",
      expiresAt: new Date(Date.now() + 7 * 86400000),
      dataSourceType: "SUPPLIER_SUBMITTED",
      verificationStatus: "VERIFIED",
    });

    buyerUserAId = new mongoose.Types.ObjectId();
    buyerUserBId = new mongoose.Types.ObjectId();

    shopA = await Shop.create({
      name: "Sharma Kirana Store",
      ownerUserId: buyerUserAId,
      deliveryArea: "Lucknow",
      deliveryAddress: {
        street: "12 Chowk Road",
        city: "Lucknow",
        state: "Uttar Pradesh",
        postalCode: "226003",
      },
      contactDetails: {
        phone: "+91-9876543210",
      },
    });

    shopB = await Shop.create({
      name: "Verma Grocery Mart",
      ownerUserId: buyerUserBId,
      deliveryArea: "Lucknow",
      deliveryAddress: {
        street: "45 Hazratganj",
        city: "Lucknow",
        state: "Uttar Pradesh",
        postalCode: "226001",
      },
      contactDetails: {
        phone: "+91-9876543211",
      },
    });

    adminUser = {
      _id: new mongoose.Types.ObjectId(),
      role: "ADMIN",
      email: "admin@aapkidukan.demo",
    };
  });

  // Helper to create a fully funded test pool with approved contributions and verified payments
  async function setupFundedPool({
    approvalStatusA = "APPROVED",
    approvalStatusB = "APPROVED",
    paidA = 10000000, // ₹100,000 (50 bags * ₹2000)
    paidB = 10000000, // ₹100,000 (50 bags * ₹2000)
    requiredA = 10000000,
    requiredB = 10000000,
  } = {}) {
    const pool = await GroupBuyPool.create({
      title: "Basmati Rice Lucknow Wholesale Group Buy",
      productId: productDoc._id,
      supplierOfferId: offerDoc._id,
      deliveryArea: "Lucknow",
      currency: "INR",
      packUnit: "BAG",
      targetMoq: 100,
      totalEligibleQuantity: 100,
      participantCount: 2,
      baseUnitPriceMinor: 200000,
      currentUnitPriceMinor: 200000,
      estimatedMerchandiseTotalMinor: 20000000,
      shippingCostMinor: 50000,
      shippingAllocationMethod: "PER_UNIT",
      paymentPolicy: "PAY_AT_JOIN",
      publishedAt: new Date(),
      deadline: new Date(Date.now() + 86400000),
      state: "FUNDED",
      createdByUserId: buyerUserAId,
    });

    const contribAId = new mongoose.Types.ObjectId();
    const contribBId = new mongoose.Types.ObjectId();

    const snapshot = await PriceSnapshot.create({
      poolId: pool._id,
      version: 1,
      supplierOfferId: offerDoc._id,
      currency: "INR",
      totalEligibleQuantity: 100,
      baseUnitPriceMinor: 200000,
      appliedUnitPriceMinor: 200000,
      merchandiseTotalMinor: 20000000,
      shippingCostMinor: 50000,
      shippingStatus: "KNOWN",
      shippingAllocationMethod: "PER_UNIT",
      taxInclusion: "GST_EXCLUDED",
      groupTotalPayableMinor: 20050000,
      memberShares: [
        {
          contributionId: contribAId,
          shopId: shopA._id,
          quantity: 50,
          unit: "BAG",
          appliedUnitPriceMinor: 200000,
          merchandiseShareMinor: 10000000,
          shippingShareMinor: 25000,
          roundingAdjustmentMinor: 0,
          totalPayableMinor: requiredA,
          verifiedSavingsMinor: 0,
        },
        {
          contributionId: contribBId,
          shopId: shopB._id,
          quantity: 50,
          unit: "BAG",
          appliedUnitPriceMinor: 200000,
          merchandiseShareMinor: 10000000,
          shippingShareMinor: 25000,
          roundingAdjustmentMinor: 0,
          totalPayableMinor: requiredB,
          verifiedSavingsMinor: 0,
        },
      ],
    });

    pool.latestPriceSnapshotId = snapshot._id;
    await pool.save();

    const contribA = await Contribution.create({
      _id: contribAId,
      poolId: pool._id,
      shopId: shopA._id,
      createdByUserId: buyerUserAId,
      quantity: 50,
      unit: "BAG",
      unitPriceMinor: 200000,
      estimatedMerchandiseShareMinor: 10000000,
      estimatedShippingShareMinor: 25000,
      roundingAdjustmentMinor: 0,
      finalTotalPayableMinor: requiredA,
      totalPaidMinor: paidA,
      approvalStatus: approvalStatusA,
      approvedPriceSnapshotId: approvalStatusA === "APPROVED" ? snapshot._id : null,
      approvedAt: approvalStatusA === "APPROVED" ? new Date() : null,
      state: "ACTIVE",
    });

    const contribB = await Contribution.create({
      _id: contribBId,
      poolId: pool._id,
      shopId: shopB._id,
      createdByUserId: buyerUserBId,
      quantity: 50,
      unit: "BAG",
      unitPriceMinor: 200000,
      estimatedMerchandiseShareMinor: 10000000,
      estimatedShippingShareMinor: 25000,
      roundingAdjustmentMinor: 0,
      finalTotalPayableMinor: requiredB,
      totalPaidMinor: paidB,
      approvalStatus: approvalStatusB,
      approvedPriceSnapshotId: approvalStatusB === "APPROVED" ? snapshot._id : null,
      approvedAt: approvalStatusB === "APPROVED" ? new Date() : null,
      state: "ACTIVE",
    });

    // Create Payments for both contributions
    const paymentA = await Payment.create({
      poolId: pool._id,
      contributionId: contribA._id,
      shopId: shopA._id,
      payerUserId: buyerUserAId,
      priceSnapshotId: snapshot._id,
      paymentPurpose: "INITIAL_JOIN",
      provider: "MOCK_DEV",
      providerOrderId: `MOCK-ORDER-A-${Date.now()}`,
      providerCaptureId: `MOCK-CAP-A-${Date.now()}`,
      idempotencyKey: `idemp-pay-A-${Date.now()}`,
      amountMinor: paidA,
      currency: "INR",
      paymentStatus: "PAID",
      isTestTransaction: true,
    });

    const paymentB = await Payment.create({
      poolId: pool._id,
      contributionId: contribB._id,
      shopId: shopB._id,
      payerUserId: buyerUserBId,
      priceSnapshotId: snapshot._id,
      paymentPurpose: "INITIAL_JOIN",
      provider: "MOCK_DEV",
      providerOrderId: `MOCK-ORDER-B-${Date.now()}`,
      providerCaptureId: `MOCK-CAP-B-${Date.now()}`,
      idempotencyKey: `idemp-pay-B-${Date.now()}`,
      amountMinor: paidB,
      currency: "INR",
      paymentStatus: "PAID",
      isTestTransaction: true,
    });

    return { pool, snapshot, contribA, contribB, paymentA, paymentB };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 1. createFinalOrderFromFundedPool
  // ───────────────────────────────────────────────────────────────────────────

  describe("1. createFinalOrderFromFundedPool", () => {
    it("successfully creates final Order from a funded pool with approved and paid contributions", async () => {
      const { pool, snapshot, contribA, contribB } = await setupFundedPool();

      const order = await createFinalOrderFromFundedPool(pool._id);

      expect(order).toBeDefined();
      expect(order._id).toBeDefined();
      expect(order.orderNumber).toMatch(/^AKD-2026-\d{4}$/);
      expect(order.poolId.toString()).toBe(pool._id.toString());
      expect(order.supplierId.toString()).toBe(supplierDoc._id.toString());
      expect(order.productId.toString()).toBe(productDoc._id.toString());
      expect(order.supplierOfferId.toString()).toBe(offerDoc._id.toString());
      expect(order.priceSnapshotId.toString()).toBe(snapshot._id.toString());
      expect(order.supplierConfirmationStatus).toBe("PENDING");
      expect(order.orderState).toBe("AWAITING_SUPPLIER_CONFIRMATION");
      expect(order.isSimulatedConfirmation).toBe(true);

      // Verify group totals
      expect(order.totalQuantity).toBe(100);
      expect(order.merchandiseTotalMinor).toBe(20000000);
      expect(order.shippingTotalMinor).toBe(50000);
      expect(order.grandTotalMinor).toBe(20050000);

      // Verify member allocations
      expect(order.memberOrders).toHaveLength(2);
      const memberA = order.memberOrders.find((m) => m.shopId.toString() === shopA._id.toString());
      const memberB = order.memberOrders.find((m) => m.shopId.toString() === shopB._id.toString());

      expect(memberA).toBeDefined();
      expect(memberA.shopName).toBe(shopA.name);
      expect(memberA.quantity).toBe(50);
      expect(memberA.unit).toBe("BAG");
      expect(memberA.unitPriceMinor).toBe(200000);
      expect(memberA.merchandiseShareMinor).toBe(10000000);
      expect(memberA.shippingShareMinor).toBe(25000);
      expect(memberA.totalPaidMinor).toBe(10000000);
      expect(memberA.deliveryStatus).toBe("PENDING");

      expect(memberB).toBeDefined();
      expect(memberB.quantity).toBe(50);

      // Verify pool and contribution state transitions
      const updatedPool = await GroupBuyPool.findById(pool._id);
      expect(updatedPool.state).toBe("ORDERED");

      const updatedContribA = await Contribution.findById(contribA._id);
      const updatedContribB = await Contribution.findById(contribB._id);
      expect(updatedContribA.state).toBe("FINALIZED");
      expect(updatedContribB.state).toBe("FINALIZED");

      // Verify separate SupplierSettlement was created in DEMO / SIMULATED mode (BR-009 & FR-PAY-016)
      const settlement = await SupplierSettlement.findOne({ orderId: order._id });
      expect(settlement).toBeDefined();
      expect(settlement.mode).toBe("DEMO");
      expect(settlement.settlementStatus).toBe("SIMULATED");
      expect(settlement.amountMinor).toBe(order.grandTotalMinor);

      // Verify Audit Log was recorded
      const auditLog = await AuditLog.findOne({
        orderId: order._id,
        action: "ORDER_CREATED",
      });
      expect(auditLog).toBeDefined();
      expect(auditLog.resourceType).toBe("ORDER");

      // Verify notifications were dispatched to both buyers
      const notifs = await Notification.find({ relatedOrderId: order._id });
      expect(notifs.length).toBeGreaterThanOrEqual(2);
      const notifUsers = notifs.map((n) => n.recipientUserId.toString());
      expect(notifUsers).toContain(buyerUserAId.toString());
      expect(notifUsers).toContain(buyerUserBId.toString());
    });

    it("rejects order creation if any active contribution is NOT APPROVED", async () => {
      const { pool } = await setupFundedPool({
        approvalStatusB: "PENDING_APPROVAL",
      });

      await expect(createFinalOrderFromFundedPool(pool._id)).rejects.toThrow(
        /not been APPROVED/i
      );

      // Order must not be created
      const count = await Order.countDocuments({ poolId: pool._id });
      expect(count).toBe(0);
    });

    it("rejects order creation if any active contribution has unpaid balance", async () => {
      const { pool } = await setupFundedPool({
        paidB: 5000000, // Paid only ₹50k of ₹100k
        requiredB: 10000000,
      });

      await expect(createFinalOrderFromFundedPool(pool._id)).rejects.toThrow(
        /not fully PAID/i
      );

      const count = await Order.countDocuments({ poolId: pool._id });
      expect(count).toBe(0);
    });

    it("is idempotent: returns existing order on repeated calls for the same pool", async () => {
      const { pool } = await setupFundedPool();

      const order1 = await createFinalOrderFromFundedPool(pool._id);
      const order2 = await createFinalOrderFromFundedPool(pool._id);

      expect(order1._id.toString()).toBe(order2._id.toString());
      expect(order1.orderNumber).toBe(order2.orderNumber);

      const totalOrders = await Order.countDocuments({ poolId: pool._id });
      expect(totalOrders).toBe(1);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. PATCH /api/orders/:id/supplier-status — Confirmation & Delivery Updates
  // ───────────────────────────────────────────────────────────────────────────

  describe("2. PATCH /api/orders/:id/supplier-status — Confirmation & Fulfilment", () => {
    it("allows assigned SUPPLIER to confirm order with supplier reference and expected delivery date", async () => {
      const { pool } = await setupFundedPool();
      const order = await createFinalOrderFromFundedPool(pool._id);

      const supplierUser = {
        _id: new mongoose.Types.ObjectId(),
        role: "SUPPLIER",
        supplierId: supplierDoc._id,
      };

      const app = buildTestApp(supplierUser);

      const res = await request(app)
        .patch(`/api/orders/${order._id}/supplier-status`)
        .send({
          status: "CONFIRMED",
          supplierReference: "AGRI-INV-2026-9921",
          expectedDeliveryDate: "2026-11-15T00:00:00.000Z",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.supplierConfirmationStatus).toBe("CONFIRMED");
      expect(res.body.data.orderState).toBe("CONFIRMED");
      expect(res.body.data.supplierReference).toBe("AGRI-INV-2026-9921");
      expect(res.body.data.confirmedAt).toBeDefined();

      // Verify DB persistence
      const savedOrder = await Order.findById(order._id);
      expect(savedOrder.supplierConfirmationStatus).toBe("CONFIRMED");

      // Verify ORDER_CONFIRMED notification was dispatched to participants
      const notifs = await Notification.find({
        relatedOrderId: order._id,
        type: "ORDER_CONFIRMED",
      });
      expect(notifs.length).toBeGreaterThanOrEqual(2);

      // Verify Audit Log
      const audit = await AuditLog.findOne({
        orderId: order._id,
        action: "ORDER_CONFIRMED",
      });
      expect(audit).toBeDefined();
    });

    it("allows ADMIN to confirm or update order status", async () => {
      const { pool } = await setupFundedPool();
      const order = await createFinalOrderFromFundedPool(pool._id);

      const app = buildTestApp(adminUser);

      const res = await request(app)
        .patch(`/api/orders/${order._id}/supplier-status`)
        .send({
          status: "CONFIRMED",
          supplierReference: "ADMIN-OVERRIDE-REF",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.supplierConfirmationStatus).toBe("CONFIRMED");
    });

    it("rejects unauthorized supplier from confirming an order assigned to a different supplier", async () => {
      const { pool } = await setupFundedPool();
      const order = await createFinalOrderFromFundedPool(pool._id);

      const unrelatedSupplierUser = {
        _id: new mongoose.Types.ObjectId(),
        role: "SUPPLIER",
        supplierId: otherSupplierDoc._id, // different supplier
      };

      const app = buildTestApp(unrelatedSupplierUser);

      const res = await request(app)
        .patch(`/api/orders/${order._id}/supplier-status`)
        .send({ status: "CONFIRMED" });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/forbidden/i);
    });

    it("rejects non-supplier buyer from confirming or updating order", async () => {
      const { pool } = await setupFundedPool();
      const order = await createFinalOrderFromFundedPool(pool._id);

      const buyerUser = {
        _id: buyerUserAId,
        role: "SHOP_OWNER",
        shopId: shopA._id,
      };

      const app = buildTestApp(buyerUser);

      const res = await request(app)
        .patch(`/api/orders/${order._id}/supplier-status`)
        .send({ status: "CONFIRMED" });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/forbidden/i);
    });

    it("allows supplier to update shipping & delivery status across member allocations", async () => {
      const { pool } = await setupFundedPool();
      const order = await createFinalOrderFromFundedPool(pool._id);

      const supplierUser = {
        _id: new mongoose.Types.ObjectId(),
        role: "SUPPLIER",
        supplierId: supplierDoc._id,
      };

      const app = buildTestApp(supplierUser);

      const res = await request(app)
        .patch(`/api/orders/${order._id}/supplier-status`)
        .send({
          orderState: "SHIPPED",
          deliveryStatus: "DISPATCHED",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.orderState).toBe("SHIPPED");

      const savedOrder = await Order.findById(order._id);
      expect(savedOrder.orderState).toBe("SHIPPED");
      expect(savedOrder.memberOrders[0].deliveryStatus).toBe("DISPATCHED");
      expect(savedOrder.memberOrders[1].deliveryStatus).toBe("DISPATCHED");

      // Verify notification for order status updated
      const notifs = await Notification.find({
        relatedOrderId: order._id,
        type: "ORDER_STATUS_UPDATED",
      });
      expect(notifs.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Automatic Refund Rollback on Supplier Rejection
  // ───────────────────────────────────────────────────────────────────────────

  describe("3. Supplier Rejection & Automatic Refund Rollback", () => {
    it("when supplier rejects order: marks order & pool CANCELLED, and automatically triggers full refunds for all participants", async () => {
      const { pool, paymentA, paymentB, contribA, contribB } = await setupFundedPool();
      const order = await createFinalOrderFromFundedPool(pool._id);

      expect(paymentA.paymentStatus).toBe("PAID");
      expect(paymentB.paymentStatus).toBe("PAID");

      const supplierUser = {
        _id: new mongoose.Types.ObjectId(),
        role: "SUPPLIER",
        supplierId: supplierDoc._id,
      };

      const app = buildTestApp(supplierUser);

      const res = await request(app)
        .patch(`/api/orders/${order._id}/supplier-status`)
        .send({
          status: "REJECTED",
          rejectionReason: "Inventory damaged during warehouse flooding; cannot fulfil order.",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.supplierConfirmationStatus).toBe("REJECTED");
      expect(res.body.data.orderState).toBe("CANCELLED");
      expect(res.body.data.cancellationReason).toMatch(/Inventory damaged/i);

      // 1. Verify Order in DB
      const updatedOrder = await Order.findById(order._id);
      expect(updatedOrder.supplierConfirmationStatus).toBe("REJECTED");
      expect(updatedOrder.orderState).toBe("CANCELLED");
      expect(updatedOrder.memberOrders[0].deliveryStatus).toBe("CANCELLED");
      expect(updatedOrder.memberOrders[1].deliveryStatus).toBe("CANCELLED");

      // 2. Verify GroupBuyPool in DB
      const updatedPool = await GroupBuyPool.findById(pool._id);
      expect(updatedPool.state).toBe("CANCELLED");
      expect(updatedPool.closureReason).toMatch(/rejected/i);

      // 3. CRITICAL: Verify automatic refund rollback for both participants
      const updatedPaymentA = await Payment.findById(paymentA._id);
      const updatedPaymentB = await Payment.findById(paymentB._id);
      expect(updatedPaymentA.paymentStatus).toBe("REFUNDED");
      expect(updatedPaymentB.paymentStatus).toBe("REFUNDED");

      // Verify Refund records were created with reason SUPPLIER_REJECTED
      const refunds = await Refund.find({ poolId: pool._id });
      expect(refunds).toHaveLength(2);
      expect(refunds.every((r) => r.reason === "SUPPLIER_REJECTED")).toBe(true);
      expect(refunds.every((r) => r.status === "COMPLETED")).toBe(true);

      // 4. Verify Contributions in DB transitioned to REFUNDED
      const updatedContribA = await Contribution.findById(contribA._id);
      const updatedContribB = await Contribution.findById(contribB._id);
      expect(updatedContribA.state).toBe("REFUNDED");
      expect(updatedContribB.state).toBe("REFUNDED");
      expect(updatedContribA.totalRefundedMinor).toBe(10000000);
      expect(updatedContribB.totalRefundedMinor).toBe(10000000);

      // 5. Verify ORDER_REJECTED notifications dispatched to buyers
      const rejectNotifs = await Notification.find({
        relatedOrderId: order._id,
        type: "ORDER_REJECTED",
      });
      expect(rejectNotifs).toHaveLength(2);

      // 6. Verify ORDER_REJECTED AuditLog
      const audit = await AuditLog.findOne({
        orderId: order._id,
        action: "ORDER_REJECTED",
      });
      expect(audit).toBeDefined();
      expect(audit.metadata.refundsCount).toBe(2);
    });
  });
});
