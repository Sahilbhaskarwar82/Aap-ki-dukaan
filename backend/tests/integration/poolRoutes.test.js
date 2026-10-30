import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import app from "../../src/app.js";
import { User } from "../../src/models/User.model.js";
import { Shop } from "../../src/models/Shop.model.js";
import { GroupBuyPool } from "../../src/models/GroupBuyPool.model.js";
import { Contribution } from "../../src/models/Contribution.model.js";
import clockService from "../../src/services/clock/clock.service.js";

let mongod;
let token;
let user;
let shop;

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
  await User.deleteMany({});
  await Shop.deleteMany({});
  await GroupBuyPool.deleteMany({});
  await Contribution.deleteMany({});

  // Seed retailer
  const regRes = await request(app)
    .post("/api/auth/register")
    .send({
      name: "Ramesh Retailer",
      email: "ramesh@kirana.com",
      password: "SecurePassword123!",
      role: "SHOP_OWNER",
      shopDetails: {
        name: "Ramesh General Store",
        businessType: "KIRANA_RETAIL",
        deliveryArea: "Nagpur Central",
        deliveryAddress: {
          street: "Shop 1, Market Rd",
          city: "Nagpur",
          state: "Maharashtra",
          postalCode: "440001",
          country: "IN",
        },
      },
    });

  token = regRes.body.data.accessToken;
  user = regRes.body.data.user;
  shop = regRes.body.data.shop;
});

describe("GroupBuyPool HTTP Routes API (PRK-08 & PRK-10)", () => {
  it("supports full RESTful lifecycle: create, list, join via /contributions, edit, delete, and decision", async () => {
    // 1. Create Pool
    const createRes = await request(app)
      .post("/api/pools")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "12oz Bio Paper Cups Pool",
        productId: new mongoose.Types.ObjectId(),
        supplierOfferId: new mongoose.Types.ObjectId(),
        deliveryArea: "Nagpur Central",
        currency: "INR",
        packUnit: "BOX",
        minimumOrderQuantity: 1000,
        retailerMoqPercentage: 20,
        retailerStepPercentage: 1,
        baseUnitPriceMinor: 8000,
      });

    expect(createRes.status).toBe(201);
    const poolId = createRes.body.data._id;
    expect(poolId).toBeDefined();

    // 2. List Pools
    const listRes = await request(app).get("/api/pools");
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);

    // 3. Get Pool Detail
    const detailRes = await request(app).get(`/api/pools/${poolId}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.pool.title).toBe("12oz Bio Paper Cups Pool");

    // 4. Join via POST /api/pools/:id/contributions
    const joinRes = await request(app)
      .post(`/api/pools/${poolId}/contributions`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        requirementId: new mongoose.Types.ObjectId(),
        quantity: 200,
        unit: "BOX",
      });

    expect(joinRes.status).toBe(201);
    const contributionId = joinRes.body.data._id;
    expect(contributionId).toBeDefined();

    // 5. Update quantity via PATCH /api/pools/:id/contributions/:contributionId
    const patchRes = await request(app)
      .patch(`/api/pools/${poolId}/contributions/${contributionId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ quantity: 250 });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.contribution.quantity).toBe(250);

    // 6. Withdraw via DELETE /api/pools/:id/contributions/:contributionId
    const deleteRes = await request(app)
      .delete(`/api/pools/${poolId}/contributions/${contributionId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.data.contribution.state).toBe("WITHDRAWN");
  });

  it("handles Under-MOQ buyer decision endpoint POST /api/pools/:id/decision", async () => {
    // Create pool and join
    const poolRes = await request(app)
      .post("/api/pools")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Under MOQ Test Pool",
        productId: new mongoose.Types.ObjectId(),
        supplierOfferId: new mongoose.Types.ObjectId(),
        deliveryArea: "Nagpur Central",
        currency: "INR",
        packUnit: "BOX",
        minimumOrderQuantity: 500,
        retailerMoqPercentage: 20,
        retailerStepPercentage: 1,
        baseUnitPriceMinor: 5000,
      });

    const poolId = poolRes.body.data._id;

    const joinRes = await request(app)
      .post(`/api/pools/${poolId}/contributions`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        requirementId: new mongoose.Types.ObjectId(),
        quantity: 100,
        unit: "BOX",
      });

    const contributionId = joinRes.body.data._id;

    // Fast-forward past 72 hours to transition pool to UNDER_MOQ_DECISION_PENDING
    clockService.advanceTimeByHours(73);
    await GroupBuyPool.findByIdAndUpdate(poolId, {
      state: "UNDER_MOQ_DECISION_PENDING",
      lockedAt: clockService.now(),
      decisionDeadline: new Date(clockService.now().getTime() + 24 * 60 * 60 * 1000),
    });

    // Buyer votes PROCEED
    const decisionRes = await request(app)
      .post(`/api/pools/${poolId}/decision`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        contributionId,
        decision: "PROCEED",
      });

    expect(decisionRes.status).toBe(200);
    expect(decisionRes.body.data.contribution.underMoqDecision).toBe("PROCEED");
  });
});
