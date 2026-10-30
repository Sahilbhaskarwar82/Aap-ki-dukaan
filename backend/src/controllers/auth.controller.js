import { User } from "../models/User.model.js";
import { Shop } from "../models/Shop.model.js";
import { withTransaction } from "../config/db.js";
import clockService from "../services/clock/clock.service.js";
import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

/**
 * Register a new user and create an associated Shop profile if role is SHOP_OWNER.
 * POST /api/auth/register
 */
export const register = asyncHandler(async (req, res) => {
  const { name, email, password, role = "SHOP_OWNER", shopDetails } = req.body;

  if (!name || !email || !password) {
    throw new ApiError(400, "Name, email, and password are required.");
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Check for duplicate email
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    throw new ApiError(409, "An account with this email address already exists.", ["DUPLICATE_EMAIL"]);
  }

  // Validate shopDetails if registering as a retail shop owner
  if (role === "SHOP_OWNER") {
    if (!shopDetails || !shopDetails.name || !shopDetails.deliveryArea || !shopDetails.deliveryAddress) {
      throw new ApiError(
        400,
        "Shop details (name, deliveryArea, and deliveryAddress with city, state, postalCode) are required for retailer registration."
      );
    }
    const { city, state, postalCode } = shopDetails.deliveryAddress || {};
    if (!city || !state || !postalCode) {
      throw new ApiError(400, "Shop deliveryAddress must include city, state, and postalCode.");
    }
  }

  let createdUser;
  let createdShop = null;

  // Execute atomically via withTransaction
  await withTransaction(async (session) => {
    const opts = session ? { session } : {};
    const userDocs = await User.create(
      [
        {
          name: name.trim(),
          email: normalizedEmail,
          passwordHash: password, // Pre-save hook hashes with bcrypt cost 12
          role,
          status: "ACTIVE",
          lastLoginAt: clockService.now(),
        },
      ],
      opts
    );
    createdUser = userDocs[0];

    if (role === "SHOP_OWNER") {
      const shopDocs = await Shop.create(
        [
          {
            ownerUserId: createdUser._id,
            name: shopDetails.name.trim(),
            businessType: shopDetails.businessType || "KIRANA_RETAIL",
            deliveryArea: shopDetails.deliveryArea.trim(),
            deliveryAddress: {
              street: shopDetails.deliveryAddress.street || "",
              city: shopDetails.deliveryAddress.city.trim(),
              state: shopDetails.deliveryAddress.state.trim(),
              postalCode: shopDetails.deliveryAddress.postalCode.trim(),
              country: shopDetails.deliveryAddress.country || "IN",
            },
            contactDetails: shopDetails.contactDetails || {},
            preferredCurrency: shopDetails.preferredCurrency || "INR",
          },
        ],
        opts
      );
      createdShop = shopDocs[0];
    }
  });

  const token = createdUser.generateAuthToken();

  res.cookie("token", token, COOKIE_OPTIONS);

  return res.status(201).json(
    new ApiResponse(
      201,
      {
        user: createdUser.toSafeObject(),
        shop: createdShop,
        token,
      },
      "Registration successful."
    )
  );
});

/**
 * Sign in existing user with email and password.
 * POST /api/auth/login
 */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, "Email and password are required.");
  }

  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail }).select("+passwordHash");

  if (!user) {
    throw new ApiError(401, "Invalid email or password.", ["INVALID_CREDENTIALS"]);
  }

  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid email or password.", ["INVALID_CREDENTIALS"]);
  }

  if (user.status === "DISABLED") {
    throw new ApiError(403, "Account has been disabled. Please contact platform support.", ["ACCOUNT_DISABLED"]);
  }

  user.lastLoginAt = clockService.now();
  await user.save();

  let shop = null;
  if (user.role === "SHOP_OWNER") {
    shop = await Shop.findOne({ ownerUserId: user._id });
  }

  const token = user.generateAuthToken();

  res.cookie("token", token, COOKIE_OPTIONS);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        user: user.toSafeObject(),
        shop,
        token,
      },
      "Login successful."
    )
  );
});

/**
 * Sign out current user and clear token cookie.
 * POST /api/auth/logout
 */
export const logout = asyncHandler(async (_req, res) => {
  res.clearCookie("token", COOKIE_OPTIONS);
  return res.status(200).json(new ApiResponse(200, null, "Logged out successfully."));
});

/**
 * Fetch authenticated user profile & active shop.
 * GET /api/auth/me (or /api/me)
 */
export const getMe = asyncHandler(async (req, res) => {
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        user: req.user.toSafeObject(),
        shop: req.shop || null,
      },
      "Current user profile fetched successfully."
    )
  );
});

export default {
  register,
  login,
  logout,
  getMe,
};
