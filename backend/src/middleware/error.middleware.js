import { ApiError } from "../utils/apiError.js";

/**
 * Centralized error-handling middleware.
 * Formats errors consistently, scrubs stack traces and secrets in production,
 * and normalizes Mongoose, Zod, and JWT errors.
 */
export const errorHandler = (err, req, res, _next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";
  let errors = err.errors || [];

  // Capture third-party payment/provider descriptions
  if (err.error && err.error.description) {
    message = err.error.description;
  }

  // Handle Mongoose Validation Error
  if (err.name === "ValidationError") {
    statusCode = 400;
    message = "Database Validation Failed";
    errors = Object.values(err.errors).map((e) => e.message);
  }

  // Handle Mongoose Duplicate Key Error (E11000)
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || "field";
    message = `Duplicate value for ${field}. A record with this ${field} already exists.`;
    errors = [`DUPLICATE_${field.toUpperCase()}`];
  }

  // Handle Zod Error
  if (err.name === "ZodError" || err.issues) {
    statusCode = 400;
    message = "Request Validation Failed";
    errors = err.issues ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`) : [];
  }

  // Handle JWT Errors
  if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid authentication token";
    errors = ["INVALID_TOKEN"];
  }

  if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Authentication token expired";
    errors = ["TOKEN_EXPIRED"];
  }

  // Handle CastError (invalid ObjectId)
  if (err.name === "CastError") {
    statusCode = 400;
    message = `Invalid format for resource identifier: ${err.value}`;
    errors = ["INVALID_ID_FORMAT"];
  }

  const responsePayload = {
    statusCode,
    success: false,
    message,
    errors: errors.length > 0 ? errors : [message],
    data: null,
  };

  // Only include stack trace in non-production/development environments
  if (process.env.NODE_ENV === "development") {
    responsePayload.stack = err.stack;
  }

  return res.status(statusCode).json(responsePayload);
};

export default errorHandler;

