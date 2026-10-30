import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import env from "../config/env.js";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [120, "Name cannot exceed 120 characters"],
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
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

/**
 * Pre-save middleware to automatically hash passwords with bcrypt cost factor 12.
 */
userSchema.pre("save", async function () {
  if (!this.isModified("passwordHash")) return;
  const salt = await bcrypt.genSalt(12);
  this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
});

/**
 * Validates a plain password against the stored bcrypt hash.
 *
 * @param {string} candidatePassword
 * @returns {Promise<boolean>}
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.passwordHash) {
    return false;
  }
  return await bcrypt.compare(candidatePassword, this.passwordHash);
};

/**
 * Generates a signed JWT authentication token.
 *
 * @returns {string} Signed JWT
 */
userSchema.methods.generateAuthToken = function () {
  return jwt.sign(
    {
      userId: this._id.toString(),
      role: this.role,
      email: this.email,
    },
    env.JWT_SECRET,
    {
      expiresIn: env.JWT_EXPIRY || "7d",
    }
  );
};

/**
 * Clean serialization excluding passwordHash.
 */
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject ? this.toObject() : { ...this };
  delete obj.passwordHash;
  return obj;
};

export const User = mongoose.model("User", userSchema);
export default User;
