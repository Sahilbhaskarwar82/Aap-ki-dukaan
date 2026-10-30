import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { GroupBuyPool } from "../../src/models/GroupBuyPool.model.js";
import { Contribution } from "../../src/models/Contribution.model.js";
import {
  createPool,
  joinPool,
  updateContributionQuantity,
  withdrawContribution,
  recalculatePool,
} from "../../src/services/groupBuy/poolLifecycle.service.js";
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

describe("Group-Buy Open Pool Lifecycle Integration Tests (PRK-08)", () => {
  let userId, shop1Id, shop2Id, shop3Id;

  beforeEach(() => {
    userId = new mongoose.Types.ObjectId();
    shop1Id = new mongoose.Types.ObjectId();
    shop2Id = new mongoose.Types.ObjectId();
    shop3Id = new mongoose.Types.ObjectId();
  });

  it("creates a pool with 72-hour countdown deadline and derived MOQ_R / Step", async () => {
    const pool = await createPool(
      {
        title: "12oz Bio Paper Cups Pool",
        productId: new mongoose.Types.ObjectId(),
        supplierOfferId: new mongoose.Types.ObjectId(),
        deliveryArea: "Nagpur",
        currency: "INR",
        packUnit: "BOX",
        minimumOrderQuantity: 1000, // MOQ_W = 1000
        retailerMoqPercentage: 20,  // MOQ_R = 200
        retailerStepPercentage: 1,  // Step = 10
        baseUnitPriceMinor: 8000,
      },
      userId
    );

    expect(pool.targetMoq).toBe(1000);
    expect(pool.minRetailerQuantity).toBe(200);
    expect(pool.quantityStepMultiple).toBe(10);
    expect(pool.state).toBe("RECRUITING");

    // Verify 72-hour deadline calculation
    const diffHours = (pool.deadline.getTime() - pool.publishedAt.getTime()) / (3600 * 1000);
    expect(diffHours).toBe(72);
  });

  it("enforces MOQ_R and Step rules when joining", async () => {
    const pool = await createPool(
      {
        title: "Boxes Pool",
        productId: new mongoose.Types.ObjectId(),
        supplierOfferId: new mongoose.Types.ObjectId(),
        deliveryArea: "Nagpur",
        minimumOrderQuantity: 1000,
        baseUnitPriceMinor: 8000,
      },
      userId
    );

    // Reject below MOQ_R (190 < 200)
    await expect(
      joinPool({
        poolId: pool._id,
        shopId: shop1Id,
        quantity: 190,
        userId,
      })
    ).rejects.toThrow(/below the required Retailer Minimum Order Quantity/);

    // Reject invalid step multiple (205 mod 10 !== 0)
    await expect(
      joinPool({
        poolId: pool._id,
        shopId: shop1Id,
        quantity: 205,
        userId,
      })
    ).rejects.toThrow(/not a valid multiple of Step 10/);

    // Accept valid quantity (200)
    const contrib = await joinPool({
      poolId: pool._id,
      shopId: shop1Id,
      quantity: 200,
      userId,
    });
    expect(contrib.quantity).toBe(200);
    expect(contrib.state).toBe("PENDING_PAYMENT");
  });

  it("prevents duplicate active contributions by the same shop", async () => {
    const pool = await createPool(
      {
        title: "Boxes Pool",
        productId: new mongoose.Types.ObjectId(),
        supplierOfferId: new mongoose.Types.ObjectId(),
        deliveryArea: "Nagpur",
        minimumOrderQuantity: 1000,
        baseUnitPriceMinor: 8000,
      },
      userId
    );

    await joinPool({ poolId: pool._id, shopId: shop1Id, quantity: 200, userId });

    await expect(
      joinPool({ poolId: pool._id, shopId: shop1Id, quantity: 300, userId })
    ).rejects.toThrow(/already has an active or pending contribution/);
  });

  it("permits quantity updates and withdrawals before lock, but blocks them after lock", async () => {
    const pool = await createPool(
      {
        title: "Boxes Pool",
        productId: new mongoose.Types.ObjectId(),
        supplierOfferId: new mongoose.Types.ObjectId(),
        deliveryArea: "Nagpur",
        minimumOrderQuantity: 1000,
        baseUnitPriceMinor: 8000,
      },
      userId
    );

    const contrib = await joinPool({
      poolId: pool._id,
      shopId: shop1Id,
      quantity: 200,
      userId,
    });

    // Update quantity up to 300 before lock
    const updateRes = await updateContributionQuantity({
      poolId: pool._id,
      contributionId: contrib._id,
      shopId: shop1Id,
      newQuantity: 300,
      userId,
    });
    expect(updateRes.contribution.quantity).toBe(300);

    // Fast-forward time past 72h deadline
    clockService.advanceTimeByHours(73);

    // Attempting update after 72h deadline is rejected
    await expect(
      updateContributionQuantity({
        poolId: pool._id,
        contributionId: contrib._id,
        shopId: shop1Id,
        newQuantity: 400,
        userId,
      })
    ).rejects.toThrow(/Contribution quantity can only be modified while the pool is in open RECRUITING state/);

    // Attempting withdrawal after 72h deadline is rejected
    await expect(
      withdrawContribution({
        poolId: pool._id,
        contributionId: contrib._id,
        shopId: shop1Id,
        userId,
      })
    ).rejects.toThrow(/Withdrawals are strictly forbidden after pool lock/);
  });

  it("triggers early lock and freezes PriceSnapshot the instant Q_pool reaches MOQ_W", async () => {
    const pool = await createPool(
      {
        title: "Early Lock Pool",
        productId: new mongoose.Types.ObjectId(),
        supplierOfferId: new mongoose.Types.ObjectId(),
        deliveryArea: "Nagpur",
        minimumOrderQuantity: 1000, // MOQ_W = 1000
        baseUnitPriceMinor: 8000,
        paymentPolicy: "PAY_AFTER_APPROVAL", // Activates immediately on join
      },
      userId
    );

    // Contrib 1: 400 units
    await joinPool({ poolId: pool._id, shopId: shop1Id, quantity: 400, userId });
    let currentPool = await GroupBuyPool.findById(pool._id);
    expect(currentPool.totalEligibleQuantity).toBe(400);
    expect(currentPool.state).toBe("RECRUITING");

    // Contrib 2: 300 units (total 700 < 1000)
    await joinPool({ poolId: pool._id, shopId: shop2Id, quantity: 300, userId });
    currentPool = await GroupBuyPool.findById(pool._id);
    expect(currentPool.totalEligibleQuantity).toBe(700);
    expect(currentPool.state).toBe("RECRUITING");

    // Contrib 3: 300 units (total 1000 >= MOQ_W) -> TRIGGERS EARLY LOCK!
    await joinPool({ poolId: pool._id, shopId: shop3Id, quantity: 300, userId });
    currentPool = await GroupBuyPool.findById(pool._id);

    expect(currentPool.totalEligibleQuantity).toBe(1000);
    expect(currentPool.lockReason).toBe("MOQ_REACHED_EARLY");
    expect(currentPool.lockedAt).toBeInstanceOf(Date);
    expect(currentPool.state).toBe("AWAITING_APPROVALS");
    expect(currentPool.priceBreakdownVersion).toBe(1);
    expect(currentPool.latestPriceSnapshotId).toBeDefined();
  });
});

