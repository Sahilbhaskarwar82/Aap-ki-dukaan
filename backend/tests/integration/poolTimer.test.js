import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { GroupBuyPool } from "../../src/models/GroupBuyPool.model.js";
import { Contribution } from "../../src/models/Contribution.model.js";
import { evaluatePoolDeadlines } from "../../src/jobs/poolScheduler.job.js";
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

describe("Early Lock & 72-Hour Pool Scheduler Job (PRK-09)", () => {
  it("locks recruiting pool below MOQ_W after 72 hours into 24h decision window", async () => {
    const publishedAt = clockService.now();
    const deadline = new Date(publishedAt.getTime() + 72 * 3600 * 1000);

    const pool = await GroupBuyPool.create({
      title: "Expiring Cups Pool",
      productId: new mongoose.Types.ObjectId(),
      supplierOfferId: new mongoose.Types.ObjectId(),
      deliveryArea: "Nagpur",
      packUnit: "BOX",
      targetMoq: 1000,
      totalEligibleQuantity: 400, // Shortfall: 400 < 1000
      baseUnitPriceMinor: 8000,
      currentUnitPriceMinor: 8000,
      publishedAt,
      deadline,
      state: "RECRUITING",
      createdByUserId: new mongoose.Types.ObjectId(),
    });

    const contrib = await Contribution.create({
      poolId: pool._id,
      shopId: new mongoose.Types.ObjectId(),
      createdByUserId: new mongoose.Types.ObjectId(),
      quantity: 400,
      unit: "BOX",
      unitPriceMinor: 8000,
      estimatedMerchandiseShareMinor: 3200000,
      finalTotalPayableMinor: 3200000,
      state: "ACTIVE",
    });

    // Advance clock past 72h
    clockService.advanceTimeByHours(73);

    const result = await evaluatePoolDeadlines();
    expect(result.lockedUnderMoq).toBe(1);

    const updatedPool = await GroupBuyPool.findById(pool._id);
    expect(updatedPool.state).toBe("UNDER_MOQ_DECISION_PENDING");
    expect(updatedPool.lockReason).toBe("EXPIRED_72H_UNDER_MOQ");
    expect(updatedPool.decisionDeadline).toBeDefined();

    // Verify 24h decision window
    const windowHours =
      (updatedPool.decisionDeadline.getTime() - updatedPool.lockedAt.getTime()) / (3600 * 1000);
    expect(windowHours).toBe(24);

    // Verify active contribution marked PENDING
    const updatedContrib = await Contribution.findById(contrib._id);
    expect(updatedContrib.underMoqDecision).toBe("PENDING");
  });

  it("does not lock pools whose 72h deadline has not expired yet", async () => {
    const publishedAt = clockService.now();
    const deadline = new Date(publishedAt.getTime() + 72 * 3600 * 1000);

    const pool = await GroupBuyPool.create({
      title: "Active Recruiting Pool",
      productId: new mongoose.Types.ObjectId(),
      supplierOfferId: new mongoose.Types.ObjectId(),
      deliveryArea: "Nagpur",
      packUnit: "BOX",
      targetMoq: 1000,
      totalEligibleQuantity: 300,
      baseUnitPriceMinor: 8000,
      currentUnitPriceMinor: 8000,
      publishedAt,
      deadline,
      state: "RECRUITING",
      createdByUserId: new mongoose.Types.ObjectId(),
    });

    // Advance clock by only 20 hours (52h remaining)
    clockService.advanceTimeByHours(20);

    const result = await evaluatePoolDeadlines();
    expect(result.lockedUnderMoq).toBe(0);

    const updatedPool = await GroupBuyPool.findById(pool._id);
    expect(updatedPool.state).toBe("RECRUITING");
  });
});

