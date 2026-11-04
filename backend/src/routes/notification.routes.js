import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import {
  listNotifications,
  markRead,
  markAllRead,
} from "../controllers/notification.controller.js";

const router = Router();

// Require authentication for all notification routes
router.use(verifyJWT);

router.get("/", listNotifications);
router.patch("/read-all", markAllRead);
router.patch("/:id/read", markRead);

export default router;