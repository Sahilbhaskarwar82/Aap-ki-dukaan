import jwt from "jsonwebtoken";
import env from "../config/env.js";
import { User } from "../models/User.model.js";
import { Shop } from "../models/Shop.model.js";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * Verifies the JSON Web Token to authenticate users and attach user data to the request.
 * Checks accessToken or token in cookies, or Authorization header Bearer token.
 */
export const verifyJWT = asyncHandler(async (req, res, next) => {
  try {
    const token =
      req.cookies?.accessToken ||
      req.cookies?.token ||
      req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      throw new ApiError(401, "Unauthorised Request\n", ["MISSING_AUTH_TOKEN"]);
    }

    let decodedToken;
    try {
      decodedToken = jwt.verify(
        token,
        process.env.ACCESS_TOKEN_SECRET || env.ACCESS_TOKEN_SECRET || env.JWT_SECRET
      );
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        throw new ApiError(401, "Authentication token has expired. Please sign in again.", ["TOKEN_EXPIRED"]);
      }
      throw new ApiError(401, "Invalid Access Token\n", ["INVALID_TOKEN"]);
    }

    const userId = decodedToken._id || decodedToken.userId;
    const user = await User.findById(userId).select("-passwordHash -refreshToken");

    if (!user) {
      throw new ApiError(401, "Invalid Access Token\n", ["USER_NOT_FOUND"]);
    }

    if (user.status === "DISABLED") {
      throw new ApiError(403, "Your account has been disabled. Please contact support.", ["ACCOUNT_DISABLED"]);
    }

    req.user = user;

    // Attach shop if retailer
    if (user.role === "SHOP_OWNER") {
      const shop = await Shop.findOne({ ownerUserId: user._id });
      req.shop = shop || null;
    }

    next();
  } catch (error) {
    throw new ApiError(
      error.statusCode || 401,
      error?.message || "Invalid Access Token\n",
      error.errors || ["INVALID_TOKEN"]
    );
  }
});

/**
 * Role-Based Access Control (RBAC) middleware.
 * Verifies that the authenticated user possesses one of the allowed roles.
 *
 * @param  {...string} roles - allowed roles (e.g. 'SHOP_OWNER', 'SUPPLIER', 'ADMIN', 'REVIEWER')
 */
export const verifyRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    throw new ApiError(403, "Access forbidden. Insufficient permissions.", ["FORBIDDEN_ROLE"]);
  }
  next();
};

// Aliases for seamless backward compatibility across existing routes and tests
export const authenticateJWT = verifyJWT;
export const requireRoles = verifyRole;

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
  verifyJWT,
  verifyRole,
  authenticateJWT,
  requireRoles,
  verifyResourceOwnership,
};
