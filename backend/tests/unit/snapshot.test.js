import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { PriceSnapshot } from "../../src/models/PriceSnapshot.model.js";
import { GroupBuyPool } from "../../src/models/GroupBuyPool.model.js";
import { Contribution } from "../../src/models/Contribution.model.js";
import {
  freezePriceSnapshot,
  approvePriceSnapshot,
  invalidateApprovalsOnMaterialChange,
} from "../../src/services/pricing/snapshot.service.js";

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
  await PriceSnapshot.deleteMany({});
  await GroupBuyPool.deleteMany({});
  await Contribution.deleteMany({});
});

describe("Versioned PriceSnapshot & Invalidation Engine (PRK-07)", () => {
  let poolId, shop1Id, shop2Id, userId;

  beforeEach(async () => {
    userId = new mongoose.Types.ObjectId();
    shop1Id = new mongoose.Types.ObjectId();
    shop2Id = new mongoose.Types.ObjectId();

    const pool = await GroupBuyPool.create({
      title: "Test Paper Cups Pool",
      productId: new mongoose.Types.ObjectId(),
      supplierOfferId: new mongoose.Types.ObjectId(),
      deliveryArea: "Lucknow",
      currency: "INR",
      packUnit: "BOX",
      targetMoq: 50,
      minRetailerQuantity: 10,
      quantityStepMultiple: 5,
      baseUnitPriceMinor: 10000,
      currentUnitPriceMinor: 9000,
      shippingCostMinor: 3000,
      shippingAllocationMethod: "PER_UNIT",
      publishedAt: new Date(),
      deadline: new Date(Date.now() + 72 * 3600 * 1000),
      createdByUserId: userId,
    });
    poolId = pool._id;

    // Create 2 contributions
    await Contribution.create([
      {
        poolId,
        shopId: shop1Id,
        createdByUserId: userId,
        quantity: 20,
        unit: "BOX",
        unitPriceMinor: 9000,
        estimatedMerchandiseShareMinor: 180000,
        finalTotalPayableMinor: 180000,
        state: "ACTIVE",
      },
      {
        poolId,
        shopId: shop2Id,
        createdByUserId: userId,
        quantity: 30,
        unit: "BOX",
        unitPriceMinor: 9000,
        estimatedMerchandiseShareMinor: 270000,
        finalTotalPayableMinor: 270000,
        state: "ACTIVE",
      },
    ]);
  });

  it("freezes version 1 PriceSnapshot and marks it active", async () => {
    const snapshot = await freezePriceSnapshot(poolId);

    expect(snapshot.version).toBe(1);
    expect(snapshot.isSuperseded).toBe(false);
    expect(snapshot.memberShares).toHaveLength(2);

    // Sum of shares equals groupTotalPayableMinor
    const totalShares = snapshot.memberShares.reduce((sum, s) => sum + s.totalPayableMinor, 0);
    expect(totalShares).toBe(snapshot.groupTotalPayableMinor);

    // Verify pool version updated
    const updatedPool = await GroupBuyPool.findById(poolId);
    expect(updatedPool.priceBreakdownVersion).toBe(1);
    expect(updatedPool.latestPriceSnapshotId.toString()).toBe(snapshot._id.toString());
  });

  it("freezing version 2 marks version 1 as superseded", async () => {
    const snap1 = await freezePriceSnapshot(poolId);
    expect(snap1.version).toBe(1);

    const snap2 = await freezePriceSnapshot(poolId);
    expect(snap2.version).toBe(2);

    const checkSnap1 = await PriceSnapshot.findById(snap1._id);
    expect(checkSnap1.isSuperseded).toBe(true);
  });

  it("approves price snapshot and updates contribution status", async () => {
    const snapshot = await freezePriceSnapshot(poolId);
    const contrib1 = await Contribution.findOne({ poolId, shopId: shop1Id });

    const approvedContrib = await approvePriceSnapshot({
      poolId,
      contributionId: contrib1._id,
      shopId: shop1Id,
      snapshotId: snapshot._id,
      userId,
    });

    expect(approvedContrib.approvalStatus).toBe("APPROVED");
    expect(approvedContrib.approvedPriceSnapshotId.toString()).toBe(snapshot._id.toString());
    expect(approvedContrib.approvedAt).toBeInstanceOf(Date);
  });

  it("invalidates prior approval when material price increase occurs in new snapshot", async () => {
    // 1. Freeze v1 at unit price 9000
    const snap1 = await freezePriceSnapshot(poolId);
    const contrib1 = await Contribution.findOne({ poolId, shopId: shop1Id });

    // Approve v1
    await approvePriceSnapshot({
      poolId,
      contributionId: contrib1._id,
      shopId: shop1Id,
      snapshotId: snap1._id,
      userId,
    });

    // 2. Increase unit price on pool (e.g. supplier price hike or sub-MOQ surcharge)
    await GroupBuyPool.updateOne(
      { _id: poolId },
      { baseUnitPriceMinor: 12000, currentUnitPriceMinor: 12000 }
    );

    // 3. Freeze v2
    const snap2 = await freezePriceSnapshot(poolId);
    expect(snap2.version).toBe(2);

    // 4. Verify contrib1 approval was invalidated
    const reloadedContrib1 = await Contribution.findById(contrib1._id);
    expect(reloadedContrib1.approvalStatus).toBe("INVALIDATED_BY_CHANGE");
    expect(reloadedContrib1.approvedAt).toBeNull();
  });
});
