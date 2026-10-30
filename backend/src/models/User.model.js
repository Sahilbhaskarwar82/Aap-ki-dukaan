import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import env from "../config/env.js";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [120, "Name cannot exceed 120 characters"],
    },
    username: {
      type: String,
      trim: true,
      lowercase: true,
      sparse: true,
      index: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: [true, "Password is required"],
      select: false,
    },
    refreshToken: {
      type: String,
      select: false,
    },
    role: {
      type: String,
      enum: ["SHOP_OWNER", "SUPPLIER", "ADMIN", "REVIEWER"],
      default: "SHOP_OWNER",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "DISABLED", "PENDING_VERIFICATION"],
      default: "ACTIVE",
      required: true,
    },
    isVerified: {
      type: Boolean,
      default: true,
    },
    verificationOtp: {
      type: String,
      select: false,
    },
    verificationOtpExpiry: {
      type: Date,
    },
    forgotPasswordOtp: {
      type: String,
      select: false,
    },
    forgotPasswordOtpExpiry: {
      type: Date,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

/**
 * Virtual password alias that sets passwordHash
 */
userSchema
  .virtual("password")
  .set(function (val) {
    this.passwordHash = val;
  })
  .get(function () {
    return this.passwordHash;
  });

/**
 * Pre-save middleware to automatically hash passwords with bcrypt cost factor 12.
 */
userSchema.pre("save", async function () {
  if (!this.isModified("passwordHash")) return;
  const salt = await bcrypt.genSalt(12);
  this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
});

/**
 * Validates a candidate password against the stored bcrypt hash.
 *
 * @param {string} candidatePassword
 * @returns {Promise<boolean>}
 */
userSchema.methods.isPasswordCorrect = async function (candidatePassword) {
  if (!this.passwordHash) {
    return false;
  }
  return await bcrypt.compare(candidatePassword, this.passwordHash);
};

// Backwards-compatible alias
userSchema.methods.comparePassword = userSchema.methods.isPasswordCorrect;

/**
 * Generates an Access Token with user identity and permissions.
 *
 * @returns {string} Signed JWT
 */
userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      userId: this._id.toString(),
      email: this.email,
      username: this.username || this.name,
      role: this.role,
    },
    process.env.ACCESS_TOKEN_SECRET || env.ACCESS_TOKEN_SECRET || env.JWT_SECRET,
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRY || env.ACCESS_TOKEN_EXPIRY || "1d",
    }
  );
};

/**
 * Generates a Refresh Token with user identifier.
 *
 * @returns {string} Signed JWT
 */
userSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      userId: this._id.toString(),
      tokenId: crypto.randomUUID(),
    },
    process.env.REFRESH_TOKEN_SECRET || env.REFRESH_TOKEN_SECRET || env.JWT_SECRET,
    {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRY || env.REFRESH_TOKEN_EXPIRY || "10d",
    }
  );
};

/**
 * Backwards-compatible auth token generator using generateAccessToken.
 */
userSchema.methods.generateAuthToken = function () {
  return this.generateAccessToken();
};

/**
 * Clean serialization excluding sensitive fields.
 */
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject ? this.toObject() : { ...this };
  delete obj.passwordHash;
  delete obj.refreshToken;
  delete obj.verificationOtp;
  delete obj.forgotPasswordOtp;
  return obj;
};

export const User = mongoose.model("User", userSchema);
export default User;
