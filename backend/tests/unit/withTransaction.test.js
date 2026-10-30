import { describe, it, expect, vi } from "vitest";
import mongoose from "mongoose";
import { withTransaction } from "../../src/config/db.js";

describe("withTransaction Helper Unit Tests (PRK-01)", () => {
  it("commits transaction on successful execution", async () => {
    const mockSession = {
      startTransaction: vi.fn(),
      commitTransaction: vi.fn().mockResolvedValue(true),
      abortTransaction: vi.fn().mockResolvedValue(true),
      endSession: vi.fn().mockResolvedValue(true),
    };

    vi.spyOn(mongoose, "startSession").mockResolvedValue(mockSession);

    const result = await withTransaction(async (session) => {
      expect(session).toBe(mockSession);
      return "SUCCESS_DATA";
    });

    expect(result).toBe("SUCCESS_DATA");
    expect(mockSession.startTransaction).toHaveBeenCalledTimes(1);
    expect(mockSession.commitTransaction).toHaveBeenCalledTimes(1);
    expect(mockSession.abortTransaction).not.toHaveBeenCalled();
    expect(mockSession.endSession).toHaveBeenCalledTimes(1);

    vi.restoreAllMocks();
  });

  it("aborts transaction and rethrows when callback throws", async () => {
    const mockSession = {
      startTransaction: vi.fn(),
      commitTransaction: vi.fn(),
      abortTransaction: vi.fn().mockResolvedValue(true),
      endSession: vi.fn().mockResolvedValue(true),
    };

    vi.spyOn(mongoose, "startSession").mockResolvedValue(mockSession);

    await expect(
      withTransaction(async () => {
        throw new Error("OPERATION_FAILED");
      })
    ).rejects.toThrow("OPERATION_FAILED");

    expect(mockSession.startTransaction).toHaveBeenCalledTimes(1);
    expect(mockSession.commitTransaction).not.toHaveBeenCalled();
    expect(mockSession.abortTransaction).toHaveBeenCalledTimes(1);
    expect(mockSession.endSession).toHaveBeenCalledTimes(1);

    vi.restoreAllMocks();
  });

  it("reuses existing session without starting a new nested transaction", async () => {
    const existingSession = { id: "existing-session-123" };
    const startSessionSpy = vi.spyOn(mongoose, "startSession");

    const result = await withTransaction(async (session) => {
      expect(session).toBe(existingSession);
      return "REUSED";
    }, existingSession);

    expect(result).toBe("REUSED");
    expect(startSessionSpy).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });
});

