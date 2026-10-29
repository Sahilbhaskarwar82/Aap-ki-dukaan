import { Router } from "express";
import {
  listNotifications,
  markRead,
  markAllRead,
} from "../controllers/notification.controller.js";

const router = Router();

function devAuthStub(req, _res, next) {
  if (!req.user && process.env.NODE_ENV !== "production") {
    req.user = req.user ?? null;
    req.shop = req.shop ?? null;
  }
  next();
}

/**
 * GET /api/notifications
 * Lists in-app notifications for authenticated user.
 */
router.get("/", devAuthStub, listNotifications);

/**
 * PATCH /api/notifications/read-all
 * Marks all unread notifications for user as read.
 */
router.patch("/read-all", devAuthStub, markAllRead);

/**
 * PATCH /api/notifications/:id/read
 * Marks single notification as read.
 */
router.patch("/:id/read", devAuthStub, markRead);

export default router;
