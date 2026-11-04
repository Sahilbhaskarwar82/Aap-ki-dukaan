import { Router } from "express";
import {
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
  sendOtp,
  resendOtp,
  verifyEmailOtp,
  verifyOtp,
  sendLoginOtp,
  loginWithOtp,
} from "../controllers/auth.controller.js";
import { verifyJWT, authenticateJWT } from "../middleware/auth.middleware.js";
import { authLimiter } from "../middleware/rateLimiter.middleware.js";

const router = Router();

// Public auth endpoints protected by rate limiting
router.post("/register", authLimiter, registerUser);
router.post("/login", authLimiter, loginUser);
router.post("/send-login-otp", authLimiter, sendLoginOtp);
router.post("/login-with-otp", authLimiter, loginWithOtp);
router.post("/send-otp", authLimiter, sendOtp);
router.post("/resend-otp", authLimiter, resendOtp);
router.post("/verify-otp", authLimiter, verifyEmailOtp);
router.post("/refresh-token", refreshAccessToken);
router.post("/forgot-password", authLimiter, forgotPassword);
router.post("/reset-password", authLimiter, resetPassword);

// Authenticated session endpoints
router.post("/logout", verifyJWT, logoutUser);
router.get("/me", verifyJWT, getCurrentUser);
router.post("/change-password", verifyJWT, changeCurrentPassword);

export default router;
