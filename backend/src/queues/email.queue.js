import Redis from "ioredis";
import { Queue } from "bullmq";
import env from "../config/env.js";

let isConnected = false;
let hasLoggedQueueWarning = false;

// maxRetriesPerRequest: null is MANDATORY for BullMQ
const redisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: false,
  retryStrategy(times) {
    if (times > 3) {
      // Stop reconnect spam if Redis is offline locally in development/test
      return null;
    }
    return Math.min(times * 500, 2000);
  },
};

const redisPassword = env.REDIS_PASSWORD || process.env.REDIS_PASSWORD;
if (redisPassword) {
  redisOptions.password = redisPassword;
}

const redisUrl = env.REDIS_URL || process.env.REDIS_URL;
const redisHost = env.REDIS_HOST || process.env.REDIS_HOST || "127.0.0.1";
const redisPort = env.REDIS_PORT || parseInt(process.env.REDIS_PORT, 10) || 6379;

export const redisConnection = redisUrl
  ? new Redis(redisUrl, redisOptions)
  : new Redis({
      host: redisHost,
      port: redisPort,
      ...redisOptions,
    });

redisConnection.on("connect", () => {
  isConnected = true;
  hasLoggedQueueWarning = false;
  console.log("✅ [Redis] Connection established for BullMQ email queue");
});

redisConnection.on("ready", () => {
  isConnected = true;
});

redisConnection.on("error", (err) => {
  isConnected = false;
  if (!hasLoggedQueueWarning) {
    console.warn("⚠️ [Redis] Offline notice (BullMQ background queue disabled):", err.message);
    hasLoggedQueueWarning = true;
  }
});

redisConnection.on("close", () => {
  isConnected = false;
});

// Primary email queue for asynchronous background jobs
export const emailQueue = new Queue("emailQueue", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: 100, // Retain last 100 completed jobs
    removeOnFail: 200,     // Retain last 200 failed jobs for diagnostics
  },
});

/**
 * Checks whether Redis is currently reachable.
 */
export const isRedisConnected = () => isConnected && redisConnection.status === "ready";

/**
 * Safe helper to enqueue email/OTP jobs.
 * If Redis is offline, safely logs and falls back without crashing the request.
 */
export const addEmailJob = async (type, data) => {
  if (redisConnection.status !== "ready" && redisConnection.status !== "connecting") {
    console.warn(`⚠️ [BullMQ] Redis offline: background job ${type} skipped from BullMQ queue.`);
    return null;
  }

  try {
    const job = await emailQueue.add(type, { ...data, type });
    return job;
  } catch (err) {
    console.warn(`⚠️ [BullMQ] Failed to enqueue background email job: ${err.message}`);
    return null;
  }
};

export default {
  redisConnection,
  emailQueue,
  isRedisConnected,
  addEmailJob,
};

