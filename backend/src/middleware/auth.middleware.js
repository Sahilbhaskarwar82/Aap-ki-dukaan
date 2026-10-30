import jwt from "jsonwebtoken";
import env from "../config/env.js";
import { User } from "../models/User.model.js";
import { Shop } from "../models/Shop.model.js";
import { ApiError } from "../utils/apiError.js";

/**
 * Extracts and verifies JWT bearer token from Authorization header or cookie.
 * Attaches authenticated user and linked shop (if retailer) to the request object.
 */
export const authenticateJWT = async (req, res, next) => {
  try {
    let token = null;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return next(new ApiError(401, "Authentication token missing. Please sign in.", ["MISSING_AUTH_TOKEN"]));
    }

    let decoded;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return next(new ApiError(401, "Authentication token has expired. Please sign in again.", ["TOKEN_EXPIRED"]));
      }
      return next(new ApiError(401, "Invalid authentication token.", ["INVALID_TOKEN"]));
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      return next(new ApiError(401, "User session not found or user deleted.", ["USER_NOT_FOUND"]));
    }

    if (user.status === "DISABLED") {
      return next(new ApiError(403, "Your account has been disabled. Please contact support.", ["ACCOUNT_DISABLED"]));
    }

    req.user = user;

    // Pre-populate shop profile if user is a retail shop owner
    if (user.role === "SHOP_OWNER") {
      const shop = await Shop.findOne({ ownerUserId: user._id });
      req.shop = shop || null;
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Role-Based Access Control (RBAC) middleware generator.
 * Restricts endpoint to specified roles.
 *
 * @param  {...string} allowedRoles - e.g. 'SHOP_OWNER', 'SUPPLIER', 'ADMIN', 'REVIEWER'
 */
export const requireRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ApiError(401, "Unauthenticated request.", ["UNAUTHENTICATED"]));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ApiError(
          403,
          `Access forbidden: required role [${allowedRoles.join(", ")}], but current role is [${req.user.role}].`,
          ["FORBIDDEN_ROLE"]
        )
      );
    }

    next();
  };
};

/**
 * Resource Ownership Verification Middleware.
 * Ensures the requesting user owns the targeted resource, or is a platform ADMIN.
 *
 * @param {Function} getResourceOwnerId - (req) => ownerUserId string or Promise<string>
 */
export const verifyResourceOwnership = (getResourceOwnerId) => {
  return async (req, res, next) => {
    if (!req.user) {
      return next(new ApiError(401, "Unauthenticated request.", ["UNAUTHENTICATED"]));
    }

    // Admins bypass resource ownership checks
    if (req.user.role === "ADMIN") {
      return next();
    }

    try {
      const ownerId = await getResourceOwnerId(req);
      if (!ownerId) {
        return next(new ApiError(404, "Target resource or resource owner not found.", ["RESOURCE_NOT_FOUND"]));
      }

      if (ownerId.toString() !== req.user._id.toString()) {
        return next(
          new ApiError(403, "Access forbidden: you do not have permission to access or modify this resource.", [
            "RESOURCE_ACCESS_FORBIDDEN",
          ])
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};

export default {
  authenticateJWT,
  requireRoles,
  verifyResourceOwnership,
};

