import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { GroupBuyPool } from "../../src/models/GroupBuyPool.model.js";
import { Contribution } from "../../src/models/Contribution.model.js";
import {
  submitBuyerUnderMoqDecision,
  processExpiredDecisionWindow,
  processSupplierUnderMoqFeasibility,
  cancelPoolAndRefundAll,
} from "../../src/services/groupBuy/underMoqDecision.service.js";
import { approvePriceSnapshot } from "../../src/services/pricing/snapshot.service.js";
import clockService from "../../src/services/clock/clock.service.js";

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
  clockService.reset();
  await GroupBuyPool.deleteMany({});
  await Contribution.deleteMany({});
});

describe("24-Hour Under-MOQ 10-Case Decision Engine (PRK-10)", () => {
  let pool, contrib1, contrib2, shop1Id, shop2Id, userId;

  beforeEach(async () => {
    userId = new mongoose.Types.ObjectId();
    shop1Id = new mongoose.Types.ObjectId();
    shop2Id = new mongoose.Types.ObjectId();

    const lockedAt = clockService.now();
    const publishedAt = new Date(lockedAt.getTime() - 72 * 3600 * 1000);
    const deadline = lockedAt;
    const decisionDeadline = new Date(lockedAt.getTime() + 24 * 3600 * 1000);

    pool = await GroupBuyPool.create({
      title: "Under-MOQ Testing Pool",
      productId: new mongoose.Types.ObjectId(),
      supplierOfferId: new mongoose.Types.ObjectId(),
      deliveryArea: "Nagpur",
      packUnit: "BOX",
      targetMoq: 1000,
      totalEligibleQuantity: 600, // Shortfall: 600 < 1000
      baseUnitPriceMinor: 8000,
      currentUnitPriceMinor: 8000,
      publishedAt,
      deadline,
      state: "UNDER_MOQ_DECISION_PENDING",
      lockedAt,
      lockReason: "EXPIRED_72H_UNDER_MOQ",
      decisionDeadline,
      createdByUserId: userId,
    });

    contrib1 = await Contribution.create({
      poolId: pool._id,
      shopId: shop1Id,
      createdByUserId: userId,
      quantity: 300,
      unit: "BOX",
      unitPriceMinor: 8000,
      estimatedMerchandiseShareMinor: 2400000,
      finalTotalPayableMinor: 2400000,
      totalPaidMinor: 2400000, // Pre-paid at join
      state: "ACTIVE",
      underMoqDecision: "PENDING",
    });

    contrib2 = await Contribution.create({
      poolId: pool._id,
      shopId: shop2Id,
      createdByUserId: userId,
      quantity: 300,
      unit: "BOX",
      unitPriceMinor: 8000,
      estimatedMerchandiseShareMinor: 2400000,
      finalTotalPayableMinor: 2400000,
      totalPaidMinor: 2400000, // Pre-paid at join
      state: "ACTIVE",
      underMoqDecision: "PENDING",
    });
  });

  // ── Case 1: All buyers PROCEED & Supplier Accepts Sub-MOQ ───────────────────
  it("Case 1: All buyers PROCEED and supplier accepts smaller volume", async () => {
    await submitBuyerUnderMoqDecision({
      poolId: pool._id,
      contributionId: contrib1._id,
      shopId: shop1Id,
      decision: "PROCEED",
    });

    await submitBuyerUnderMoqDecision({
      poolId: pool._id,
      contributionId: contrib2._id,
      shopId: shop2Id,
      decision: "PROCEED",
    });

    let currentPool = await GroupBuyPool.findById(pool._id);
    expect(currentPool.state).toBe("AWAITING_SUPPLIER_UNDER_MOQ_FEASIBILITY");

    // Supplier accepts sub-MOQ
    await processSupplierUnderMoqFeasibility({
      poolId: pool._id,
      action: "ACCEPT_ORIGINAL",
    });

    currentPool = await GroupBuyPool.findById(pool._id);
    expect(currentPool.supplierUnderMoqStatus).toBe("ACCEPTED_SUB_MOQ");
    expect(currentPool.state).toBe("AWAITING_APPROVALS");
  });

  // ── Case 2: All buyers CANCEL ──────────────────────────────────────────────
  it("Case 2: All buyers CANCEL -> Pool transitions to CANCELLED and refunds all", async () => {
    await submitBuyerUnderMoqDecision({
      poolId: pool._id,
      contributionId: contrib1._id,
      shopId: shop1Id,
      decision: "CANCEL",
    });

    const res2 = await submitBuyerUnderMoqDecision({
      poolId: pool._id,
      contributionId: contrib2._id,
      shopId: shop2Id,
      decision: "CANCEL",
    });

    expect(res2.refundRequired).toBe(true);

    const cancelledPool = await GroupBuyPool.findById(pool._id);
    expect(cancelledPool.state).toBe("CANCELLED");
    expect(cancelledPool.closureReason).toBe("ALL_BUYERS_CANCELLED_UNDER_MOQ");
  });

  // ── Case 3: Mixed responses (Buyer 1 PROCEED, Buyer 2 CANCEL) ──────────────
  it("Case 3: Mixed responses (Shop 1 proceeds, Shop 2 cancels and is refunded)", async () => {
    await submitBuyerUnderMoqDecision({
      poolId: pool._id,
      contributionId: contrib1._id,
      shopId: shop1Id,
      decision: "PROCEED",
    });

    const resCancel = await submitBuyerUnderMoqDecision({
      poolId: pool._id,
      contributionId: contrib2._id,
      shopId: shop2Id,
      decision: "CANCEL",
    });

    expect(resCancel.refundRequired).toBe(true);
    expect(resCancel.refundAmountMinor).toBe(2400000);

    const reloadedContrib2 = await Contribution.findById(contrib2._id);
    expect(reloadedContrib2.state).toBe("CANCELLED_UNDER_MOQ");

    // Pool recalculated with remaining active volume (300 units)
    const updatedPool = await GroupBuyPool.findById(pool._id);
    expect(updatedPool.totalEligibleQuantity).toBe(300);
    expect(updatedPool.participantCount).toBe(1);
    expect(updatedPool.state).toBe("AWAITING_SUPPLIER_UNDER_MOQ_FEASIBILITY");
  });

  // ── Case 4: Non-responsive buyers after 24h (Silence != Consent) ───────────
  it("Case 4: Non-responsive buyers after 24h are marked EXPIRED_NO_RESPONSE and excluded", async () => {
    // Shop 1 voted PROCEED, Shop 2 never voted
    await submitBuyerUnderMoqDecision({
      poolId: pool._id,
      contributionId: contrib1._id,
      shopId: shop1Id,
      decision: "PROCEED",
    });

    // 24h expires
    clockService.advanceTimeByHours(25);

    const outcome = await processExpiredDecisionWindow(pool._id);
    expect(outcome.outcome).toBe("AWAITING_SUPPLIER_FEASIBILITY");

    const nonResponsiveContrib = await Contribution.findById(contrib2._id);
    expect(nonResponsiveContrib.underMoqDecision).toBe("EXPIRED_NO_RESPONSE");
    expect(nonResponsiveContrib.state).toBe("CANCELLED_UNDER_MOQ");
  });

  // ── Case 5: Supplier rejects order below MOQ_W ─────────────────────────────
  it("Case 5: Supplier rejects sub-MOQ order -> Pool cancelled, all refunded", async () => {
    await processSupplierUnderMoqFeasibility({
      poolId: pool._id,
      action: "REJECT",
    });

    const rejectedPool = await GroupBuyPool.findById(pool._id);
    expect(rejectedPool.state).toBe("CANCELLED");
    expect(rejectedPool.supplierUnderMoqStatus).toBe("REJECTED_SUB_MOQ");
    expect(rejectedPool.closureReason).toBe("SUPPLIER_REJECTED_SUB_MOQ");

    const c1 = await Contribution.findById(contrib1._id);
    expect(c1.state).toBe("CANCELLED_UNDER_MOQ");
  });

  // ── Case 6 & 7: Revised supplier quote & Surcharge requirement ─────────────
  it("Case 6 & 7: Revised supplier quote invalidates prior approvals and sets surcharge", async () => {
    // Supplier provides revised quote at ₹95/box (9500 paise, up from 8000)
    await processSupplierUnderMoqFeasibility({
      poolId: pool._id,
      action: "REVISED_QUOTE",
      revisedQuoteData: {
        unitPriceMinor: 9500,
        shippingCostMinor: 4000,
      },
    });

    const updatedPool = await GroupBuyPool.findById(pool._id);
    expect(updatedPool.state).toBe("AWAITING_REVISED_QUOTE_APPROVAL");
    expect(updatedPool.currentUnitPriceMinor).toBe(9500);
    expect(updatedPool.latestPriceSnapshotId).toBeDefined();

    // Verify contributions reflect new higher payable
    const c1 = await Contribution.findById(contrib1._id);
    expect(c1.unitPriceMinor).toBe(9500);
    expect(c1.finalTotalPayableMinor).toBeGreaterThan(2400000);
  });

  // ── Case 8: Extra payment fails ───────────────────────────────────────────
  it("Case 8: Extra payment failure cancels pool and refunds earlier captures", async () => {
    // If extra delta payment fails, pool transitions to CANCELLED
    await cancelPoolAndRefundAll(pool._id, "UNDER_MOQ_SURCHARGE_PAYMENT_FAILED");

    const cancelledPool = await GroupBuyPool.findById(pool._id);
    expect(cancelledPool.state).toBe("CANCELLED");
    expect(cancelledPool.closureReason).toBe("UNDER_MOQ_SURCHARGE_PAYMENT_FAILED");
  });

  // ── Case 9: Remaining participants no longer meet viable quantity floor ────
  it("Case 9: Zero buyers proceed after 24h -> Auto-cancels pool", async () => {
    // Both buyers fail to respond
    clockService.advanceTimeByHours(25);

    const outcome = await processExpiredDecisionWindow(pool._id);
    expect(outcome.outcome).toBe("CANCELLED");

    const cancelledPool = await GroupBuyPool.findById(pool._id);
    expect(cancelledPool.state).toBe("CANCELLED");
  });

  // ── Case 10: Pool cancellation at any stage ────────────────────────────────
  it("Case 10: Pool cancellation initiates full refunds and marks contributions", async () => {
    await cancelPoolAndRefundAll(pool._id, "ADMIN_MANUAL_CANCEL");

    const cancelledPool = await GroupBuyPool.findById(pool._id);
    expect(cancelledPool.state).toBe("CANCELLED");
    expect(cancelledPool.closedAt).toBeDefined();

    const c1 = await Contribution.findById(contrib1._id);
    expect(c1.state).toBe("CANCELLED_UNDER_MOQ");
  });

  // ── Concurrency Test: Simultaneous votes via Promise.all ───────────────────
  it("Concurrency Safety: Handles simultaneous buyer votes without race condition", async () => {
    const results = await Promise.all([
      submitBuyerUnderMoqDecision({
        poolId: pool._id,
        contributionId: contrib1._id,
        shopId: shop1Id,
        decision: "PROCEED",
      }),
      submitBuyerUnderMoqDecision({
        poolId: pool._id,
        contributionId: contrib2._id,
        shopId: shop2Id,
        decision: "PROCEED",
      }),
    ]);

    expect(results).toHaveLength(2);
    expect(results[0].decision).toBe("PROCEED");
    expect(results[1].decision).toBe("PROCEED");

    const finalPool = await GroupBuyPool.findById(pool._id);
    expect(finalPool.totalEligibleQuantity).toBe(600);
    expect(finalPool.state).toBe("AWAITING_SUPPLIER_UNDER_MOQ_FEASIBILITY");
  });
});
