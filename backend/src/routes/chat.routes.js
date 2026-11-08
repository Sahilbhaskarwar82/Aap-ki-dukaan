import { Router } from "express";
import { handleChatMessage } from "../controllers/chat.controller.js";

const router = Router();

/**
 * POST /api/chat
 * Public/authenticated endpoint for Kirana & Wholesale AI Copilot
 */
router.post("/", handleChatMessage);

export default router;
