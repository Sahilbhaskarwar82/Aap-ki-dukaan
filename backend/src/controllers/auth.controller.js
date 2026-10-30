import { User } from "../models/User.model.js";
import { Shop } from "../models/Shop.model.js";
import { withTransaction } from "../config/db.js";
import clockService from "../services/clock/clock.service.js";
import { ApiError } from "../utils/apiError.js";
import { APIResponse, ApiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import jwt from "jsonwebtoken";
import env from "../config/env.js";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

/**
 * Helper function to generate and persist Access & Refresh tokens.
 *
 * @param {string|mongoose.Types.ObjectId} userId
 * @returns {Promise<{accessToken: string, refreshToken: string}>}
 */
export const generateAccessAndRefreshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, "User not found for token generation");
    }

    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    console.error("Token Generation Error:", err);
    throw new ApiError(500, "Something went wrong while generating tokens");
  }
};

/**
 * Register a new user and create an associated Shop profile if role is SHOP_OWNER.
 * POST /api/auth/register
 */
export const registerUser = asyncHandler(async (req, res) => {
  const { name, username, email, password, role = "SHOP_OWNER", shopDetails } = req.body;

  const displayName = name || username;
  if (!displayName || !email || !password) {
    throw new ApiError(400, "Name/username, email, and password are required.");
  }

  const normalizedEmail = email.toLowerCase().trim();
  const normalizedUsername = username ? username.toLowerCase().trim() : undefined;

  // Check for duplicate email or username
  const existingUser = await User.findOne({
    $or: [
      { email: normalizedEmail },
      ...(normalizedUsername ? [{ username: normalizedUsername }] : []),
    ],
  });

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
          name: displayName.trim(),
          username: normalizedUsername,
          email: normalizedEmail,
          passwordHash: password, // Pre-save hook hashes with bcrypt cost 12
          role,
          status: "ACTIVE",
          isVerified: true,
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

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(createdUser._id);

  return res
    .status(201)
    .cookie("accessToken", accessToken, COOKIE_OPTIONS)
    .cookie("refreshToken", refreshToken, COOKIE_OPTIONS)
    .cookie("token", accessToken, COOKIE_OPTIONS)
    .json(
      new APIResponse(
        201,
        {
          user: createdUser.toSafeObject(),
          shop: createdShop,
          accessToken,
          refreshToken,
          token: accessToken,
        },
        "User registered successfully."
      )
    );
});

export const register = registerUser;

/**
 * Sign in existing user with email/username and password.
 * POST /api/auth/login
 */
export const loginUser = asyncHandler(async (req, res) => {
  const { username, email, password } = req.body;

  if (!email && !username) {
    throw new ApiError(400, "Username or email is required.");
  }
  if (!password) {
    throw new ApiError(400, "Password is required.");
  }

  const identifier = (email || username).toLowerCase().trim();
  const user = await User.findOne({
    $or: [{ email: identifier }, { username: identifier }],
  }).select("+passwordHash +refreshToken");

  if (!user) {
    throw new ApiError(401, "Invalid email or password.", ["INVALID_CREDENTIALS"]);
  }

  const isPasswordCorrect = await user.isPasswordCorrect(password);
  if (!isPasswordCorrect) {
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

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id);

  return res
    .status(200)
    .cookie("accessToken", accessToken, COOKIE_OPTIONS)
    .cookie("refreshToken", refreshToken, COOKIE_OPTIONS)
    .cookie("token", accessToken, COOKIE_OPTIONS)
    .json(
      new APIResponse(
        200,
        {
          user: user.toSafeObject(),
          shop,
          accessToken,
          refreshToken,
          token: accessToken,
        },
        "User logged in successfully."
      )
    );
});

export const login = loginUser;

/**
 * Sign out current user, clear DB refreshToken and clear auth cookies.
 * POST /api/auth/logout
 */
export const logoutUser = asyncHandler(async (req, res) => {
  if (req.user?._id) {
    await User.findByIdAndUpdate(
      req.user._id,
      { $unset: { refreshToken: 1 } },
      { new: true }
    );
  }

  return res
    .status(200)
    .clearCookie("accessToken", COOKIE_OPTIONS)
    .clearCookie("refreshToken", COOKIE_OPTIONS)
    .clearCookie("token", COOKIE_OPTIONS)
    .json(new APIResponse(200, {}, "Logged out successfully."));
});

export const logout = logoutUser;

/**
 * Regenerates a new Access Token using a valid Refresh Token.
 * POST /api/auth/refresh-token
 */
export const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingToken = req.cookies?.refreshToken || req.body?.refreshToken;

  if (!incomingToken) {
    throw new ApiError(401, "Unauthorized request: Refresh token missing.");
  }

  try {
    const decoded = jwt.verify(
      incomingToken,
      process.env.REFRESH_TOKEN_SECRET || env.REFRESH_TOKEN_SECRET || env.JWT_SECRET
    );

    const user = await User.findById(decoded?._id || decoded?.userId).select("+refreshToken");
    if (!user) {
      throw new ApiError(401, "Invalid refresh token: User not found.");
    }

    if (incomingToken !== user.refreshToken) {
      throw new ApiError(401, "Refresh token is expired or already used.");
    }

    const { accessToken, refreshToken: newRefreshToken } = await generateAccessAndRefreshTokens(user._id);

    return res
      .status(200)
      .cookie("accessToken", accessToken, COOKIE_OPTIONS)
      .cookie("refreshToken", newRefreshToken, COOKIE_OPTIONS)
      .cookie("token", accessToken, COOKIE_OPTIONS)
      .json(
        new APIResponse(
          200,
          { accessToken, refreshToken: newRefreshToken, token: accessToken },
          "Access token refreshed successfully."
        )
      );
  } catch (error) {
    throw new ApiError(401, error.message || "Invalid refresh token");
  }
});

/**
 * Fetch authenticated user profile & active shop.
 * GET /api/auth/me
 */
export const getCurrentUser = asyncHandler(async (req, res) => {
  const shop =
    req.shop ||
    (req.user?.role === "SHOP_OWNER"
      ? await Shop.findOne({ ownerUserId: req.user._id })
      : null);

  return res.status(200).json(
    new APIResponse(
      200,
      {
        user: req.user.toSafeObject ? req.user.toSafeObject() : req.user,
        shop: shop || null,
      },
      "Current user profile fetched successfully."
    )
  );
});

export const getMe = getCurrentUser;

/**
 * Change authenticated user's password.
 * POST /api/auth/change-password
 */
export const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    throw new ApiError(400, "Both old and new passwords are required.");
  }
  if (newPassword.length < 8) {
    throw new ApiError(400, "New password must be at least 8 characters.");
  }

  const user = await User.findById(req.user._id).select("+passwordHash");
  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);
  if (!isPasswordCorrect) {
    throw new ApiError(400, "Old password is incorrect.");
  }

  user.password = newPassword;
  await user.save({ validateBeforeSave: false });

  return res.status(200).json(new APIResponse(200, {}, "Password changed successfully."));
});

/**
 * Request a 6-digit OTP for password reset.
 * POST /api/auth/forgot-password
 */
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) {
    throw new ApiError(400, "Email is required.");
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) {
    throw new ApiError(404, "No verified account found with this email.");
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  user.forgotPasswordOtp = otp;
  user.forgotPasswordOtpExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
  await user.save({ validateBeforeSave: false });

  return res.status(200).json(new APIResponse(200, { email: user.email }, "OTP sent to your email."));
});

/**
 * Reset password using verification OTP.
 * POST /api/auth/reset-password
 */
export const resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    throw new ApiError(400, "All fields (email, otp, newPassword) are required.");
  }
  if (newPassword.length < 8) {
    throw new ApiError(400, "New password must be at least 8 characters.");
  }

  const user = await User.findOne({
    email: email.toLowerCase().trim(),
    forgotPasswordOtp: otp.toString(),
  }).select("+passwordHash +forgotPasswordOtp");

  if (!user) {
    throw new ApiError(400, "Invalid OTP or email.");
  }

  if (user.forgotPasswordOtpExpiry && user.forgotPasswordOtpExpiry < new Date()) {
    throw new ApiError(400, "OTP has expired.");
  }

  user.password = newPassword;
  user.forgotPasswordOtp = undefined;
  user.forgotPasswordOtpExpiry = undefined;
  await user.save({ validateBeforeSave: false });

  return res.status(200).json(new APIResponse(200, {}, "Password reset successfully."));
});

export default {
  registerUser,
  register,
  loginUser,
  login,
  logoutUser,
  logout,
  refreshAccessToken,
  getCurrentUser,
  getMe,
  changeCurrentPassword,
  forgotPassword,
  resetPassword,
  generateAccessAndRefreshTokens,
};
