import mongoose from "mongoose";
import env from "./env.js";
import { DB_NAME } from "../constants.js";

const MONGO_OPTIONS = {
  maxPoolSize: 10,
  minPoolSize: 2,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

let isConnected = false;
let memoryServer = null;

export const connectDB = async (uri = null) => {
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  let connectionString = uri;
  if (!connectionString) {
    const trimmed = (env.MONGODB_URI || "mongodb://localhost:27017").replace(/\/+$/, "");
    // If MONGODB_URI has no database path component (e.g. mongodb://localhost:27017), append DB_NAME
    const parts = trimmed.split("/");
    if (parts.length <= 3) {
      connectionString = `${trimmed}/${DB_NAME}`;
    } else {
      connectionString = trimmed;
    }
  }

  try {
    const connectionInstance = await mongoose.connect(connectionString, MONGO_OPTIONS);
    isConnected = true;
    console.log(`MongoDB connected successfully: host=${connectionInstance.connection.host}`);
    return connectionInstance;
  } catch (err) {
    // If running in development and local mongo isn't up, spin up MongoMemoryServer fallback
    if (process.env.NODE_ENV === "development" && !uri) {
      try {
        console.warn(`Local MongoDB not detected at ${connectionString}. Starting MongoMemoryServer fallback...`);
        const { MongoMemoryServer } = await import("mongodb-memory-server");
        memoryServer = await MongoMemoryServer.create({
          instance: { port: 27017, dbName: DB_NAME },
        });
        const memUri = memoryServer.getUri();
        const connectionInstance = await mongoose.connect(memUri, MONGO_OPTIONS);
        isConnected = true;
        console.log(`Embedded MongoMemoryServer connected successfully at: ${memUri}`);
        return connectionInstance;
      } catch (memErr) {
        try {
          const { MongoMemoryServer } = await import("mongodb-memory-server");
          if (!memoryServer) {
            memoryServer = await MongoMemoryServer.create({ instance: { dbName: DB_NAME } });
          }
          const memUri = memoryServer.getUri();
          const connectionInstance = await mongoose.connect(memUri, MONGO_OPTIONS);
          isConnected = true;
          console.log(`Embedded MongoMemoryServer connected on dynamic port: ${memUri}`);
          return connectionInstance;
        } catch (dynErr) {
          console.error("Failed to start MongoMemoryServer fallback:", dynErr.message);
        }
      }
    }

    console.error("MongoDB connection failed:", err.message);
    if (process.env.NODE_ENV !== "test") {
      process.exit(1);
    }
    throw err;
  }
};

export const disconnectDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
  }
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
};

/**
 * Wraps multi-document operations in a MongoDB session transaction.
 * If an existing session is passed, it reuses that session instead of nesting.
 * When running against a standalone MongoDB without replica set support,
 * it automatically falls back to non-transactional execution.
 *
 * @param {Function} fn - async (session) => result
 * @param {ClientSession|null} [existingSession=null]
 * @returns {Promise<*>}
 */
export const withTransaction = async (fn, existingSession = null) => {
  if (existingSession) {
    return await fn(existingSession);
  }

  let session = null;
  try {
    session = await mongoose.startSession();
  } catch (err) {
    return await fn(null);
  }

  try {
    session.startTransaction();
    const result = await fn(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    try {
      await session.abortTransaction();
    } catch (_abortErr) {
      // ignore
    }

    // Graceful fallback for standalone test MongoDB instances
    if (
      error.message &&
      (error.message.includes("Transaction numbers are only allowed on a replica set") ||
        error.message.includes("replica set member or mongos") ||
        error.message.includes("does not support retryable writes"))
    ) {
      return await fn(null);
    }

    throw error;
  } finally {
    try {
      await session.endSession();
    } catch (_endErr) {
      // ignore
    }
  }
};

export default connectDB;
