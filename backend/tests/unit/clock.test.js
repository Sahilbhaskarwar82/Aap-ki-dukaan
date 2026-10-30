import { describe, it, expect, beforeEach, afterEach } from "vitest";
import clockService from "../../src/services/clock/clock.service.js";

describe("ClockService Unit Tests (PRK-02)", () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";
    clockService.reset();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    clockService.reset();
  });

  it("returns approximately real time when no offset is set", () => {
    const realNow = Date.now();
    const clockNow = clockService.now().getTime();
    expect(Math.abs(clockNow - realNow)).toBeLessThan(50);
  });

  it("advances time instantaneously by 72 hours (259,200,000 ms)", () => {
    const startMs = clockService.now().getTime();
    const MS_72_HOURS = 72 * 60 * 60 * 1000; // 259,200,000 ms

    clockService.advanceTimeByMs(MS_72_HOURS);
    const after72h = clockService.now().getTime();

    expect(after72h - startMs).toBe(MS_72_HOURS);
  });

  it("advances time instantaneously by 24 hours (86,400,000 ms)", () => {
    const startMs = clockService.now().getTime();
    const MS_24_HOURS = 24 * 60 * 60 * 1000; // 86,400,000 ms

    clockService.advanceTimeByHours(24);
    const after24h = clockService.now().getTime();

    expect(after24h - startMs).toBe(MS_24_HOURS);
  });

  it("supports fixed time setting and advancement from fixed time", () => {
    const fixedIso = "2026-10-28T12:00:00.000Z";
    clockService.setFixedTime(fixedIso);

    expect(clockService.now().toISOString()).toBe(fixedIso);

    // Advance by 1 hour
    clockService.advanceTimeByHours(1);
    expect(clockService.now().toISOString()).toBe("2026-10-28T13:00:00.000Z");
  });

  it("resets back to real wall-clock time cleanly", () => {
    clockService.advanceTimeByDays(100);
    expect(clockService.now().getTime() - Date.now()).toBeGreaterThan(99 * 24 * 3600 * 1000);

    clockService.reset();
    expect(Math.abs(clockService.now().getTime() - Date.now())).toBeLessThan(50);
  });

  it("throws when time manipulation is attempted in production mode", () => {
    process.env.NODE_ENV = "production";

    expect(() => clockService.advanceTimeByMs(1000)).toThrow(
      "ClockService time manipulation is strictly forbidden in production mode."
    );
    expect(() => clockService.setFixedTime(new Date())).toThrow(
      "ClockService time manipulation is strictly forbidden in production mode."
    );
    expect(() => clockService.reset()).toThrow(
      "ClockService time manipulation is strictly forbidden in production mode."
    );
  });

  it("throws when invalid arguments are provided", () => {
    expect(() => clockService.advanceTimeByMs("invalid")).toThrow(TypeError);
    expect(() => clockService.setFixedTime("not-a-valid-date")).toThrow(RangeError);
  });
});

