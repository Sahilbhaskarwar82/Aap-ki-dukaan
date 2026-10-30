import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../../src/app.js";

describe("Health Check API Integration Test (PRK-01)", () => {
  it("GET /api/health returns 200 OK with database state and timestamp", async () => {
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("status", "HEALTHY");
    expect(res.body.data).toHaveProperty("database");
    expect(res.body.data).toHaveProperty("timestamp");
    expect(res.body.data).toHaveProperty("uptimeSeconds");
    expect(res.body.data).toHaveProperty("environment");

    // Must include correlation ID from correlation middleware
    expect(res.headers).toHaveProperty("x-correlation-id");
  });
});

