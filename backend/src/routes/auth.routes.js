import { Router } from "express";
import { register, login, logout, getMe } from "../controllers/auth.controller.js";
import { authenticateJWT } from "../middleware/auth.middleware.js";
import { authLimiter } from "../middleware/rateLimiter.middleware.js";

const router = Router();

// Public auth endpoints protected by rate limiting
router.post("/register", authLimiter, register);
router.post("/login", authLimiter, login);

// Authenticated session endpoints
router.post("/logout", authenticateJWT, logout);
router.get("/me", authenticateJWT, getMe);

export default router;

