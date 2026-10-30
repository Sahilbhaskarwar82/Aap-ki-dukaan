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

export const connectDB = async (uri = null) => {
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  const connectionString = uri || `${env.MONGODB_URI}/${DB_NAME}`;

  try {
    const connectionInstance = await mongoose.connect(connectionString, MONGO_OPTIONS);
    isConnected = true;
    console.log(`MongoDB connected successfully: host=${connectionInstance.connection.host}`);
    return connectionInstance;
  } catch (err) {
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
