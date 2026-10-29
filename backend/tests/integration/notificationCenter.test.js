/**
 * Integration Tests — SRU-08
 * Persistent In-App Notification Center & Fault Isolation
 *
 * Requirements:
 *  - Supports all 19 lifecycle event types.
 *  - FR-NOTIF-004: Non-throwing try/catch boundary protects financial and lifecycle state mutations.
 *  - Enforces recipient ownership on read/unread mutations.
 *  - GET /api/notifications, PATCH /api/notifications/:id/read, PATCH /api/notifications/read-all.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import express from "express";

import { Notification, NOTIFICATION_TYPES } from "../../src/models/Notification.model.js";
import {
  createNotification,
  sendEmailNotification,
  listNotificationsForUser,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "../../src/services/notifications/notification.service.js";
import notificationRouter from "../../src/routes/notification.routes.js";

function buildTestApp(getUser) {
  const app = express();
  app.use(express.json());

  app.use((req, _res, next) => {
    req.user = typeof getUser === "function" ? getUser(req) : getUser;
    next();
  });

  app.use("/api/notifications", notificationRouter);

  app.use((err, _req, res, _next) => {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      statusCode,
      message: err.message,
    });
  });

  return app;
}

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { retryWrites: false });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("Task SRU-08: Persistent In-App Notification Center", () => {
  let userAId;
  let userBId;
  let shopAId;

  beforeEach(async () => {
    await Notification.deleteMany({});
    userAId = new mongoose.Types.ObjectId();
    userBId = new mongoose.Types.ObjectId();
    shopAId = new mongoose.Types.ObjectId();
  });

  // ── 1. Model & 19 Lifecycle Types ──────────────────────────────────────────
  it("1. Notification model successfully supports and persists all 19 lifecycle event types", async () => {
    expect(NOTIFICATION_TYPES).toHaveLength(19);

    for (const type of NOTIFICATION_TYPES) {
      const res = await createNotification({
        recipientUserId: userAId,
        shopId: shopAId,
        type,
        title: `Event: ${type}`,
        message: `Notification body for ${type}`,
        linkUrl: `/events/${type.toLowerCase()}`,
        throwOnError: true,
      });

      expect(res.success).toBe(true);
      expect(res.notification).toBeDefined();
      expect(res.notification.type).toBe(type);
      expect(res.notification.isRead).toBe(false);
      expect(res.notification.readAt).toBeNull();
    }

    const count = await Notification.countDocuments({ recipientUserId: userAId });
    expect(count).toBe(19);
  });

  // ── 2. FR-NOTIF-004 Fault Isolation ────────────────────────────────────────
  it("2. FR-NOTIF-004: createNotification never throws by default on invalid input (fault isolation)", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Missing recipientUserId — should NOT throw
    const resMissingRecipient = await createNotification({
      type: "POOL_JOINED",
      title: "Joined",
      message: "Test",
    });

    expect(resMissingRecipient.success).toBe(false);
    expect(resMissingRecipient.error).toMatch(/recipientUserId is required/i);

    // Invalid lifecycle event type — should NOT throw
    const resInvalidType = await createNotification({
      recipientUserId: userAId,
      type: "TOTALLY_INVALID_EVENT_XYZ",
      title: "Invalid",
      message: "Test",
    });

    expect(resInvalidType.success).toBe(false);
    expect(resInvalidType.error).toMatch(/Invalid notification type/i);

    // Calling mutations (e.g. payment/order confirmation) are protected from crashes
    consoleSpy.mockRestore();
  });

  // ── 3. listNotifications service & unread counts ───────────────────────────
  it("3. listNotificationsForUser accurately computes unreadCount and isolates users", async () => {
    // Create 3 notifications for User A (2 unread, 1 read)
    await createNotification({
      recipientUserId: userAId,
      type: "POOL_CREATED",
      title: "Pool Created",
      message: "Your group buy pool is now live",
    });

    const notif2 = await createNotification({
      recipientUserId: userAId,
      type: "PAYMENT_VERIFIED",
      title: "Payment Verified",
      message: "Payment captured successfully",
    });

    await createNotification({
      recipientUserId: userAId,
      type: "ORDER_CONFIRMED",
      title: "Order Confirmed",
      message: "Supplier confirmed your order",
    });

    // Mark notif2 as read
    await markNotificationAsRead(notif2.notification._id, userAId);

    // Create 1 notification for User B
    await createNotification({
      recipientUserId: userBId,
      type: "REFUND_COMPLETED",
      title: "Refund Completed",
      message: "Refund processed",
    });

    // Fetch User A feed
    const userAFeed = await listNotificationsForUser(userAId);
    expect(userAFeed.total).toBe(3);
    expect(userAFeed.unreadCount).toBe(2);
    expect(userAFeed.notifications).toHaveLength(3);

    // User A feed must not contain User B notifications
    const hasUserBNotif = userAFeed.notifications.some(
      (n) => n.recipientUserId.toString() === userBId.toString()
    );
    expect(hasUserBNotif).toBe(false);

    // Filter by unread
    const unreadOnly = await listNotificationsForUser(userAId, { isRead: false });
    expect(unreadOnly.total).toBe(2);
  });

  // ── 4. markNotificationAsRead & ownership guard ────────────────────────────
  it("4. markNotificationAsRead sets readAt and prevents User B from modifying User A's notification", async () => {
    const { notification } = await createNotification({
      recipientUserId: userAId,
      type: "SNAPSHOT_APPROVAL_REQUIRED",
      title: "Approval Required",
      message: "Please approve the latest PriceSnapshot",
    });

    // User B attempts to mark User A's notification as read
    await expect(
      markNotificationAsRead(notification._id, userBId)
    ).rejects.toThrow(/Forbidden|another user/i);

    // User A marks their own notification as read
    const updated = await markNotificationAsRead(notification._id, userAId);
    expect(updated.isRead).toBe(true);
    expect(updated.readAt).toBeInstanceOf(Date);
  });

  // ── 5. markAllNotificationsAsRead ──────────────────────────────────────────
  it("5. markAllNotificationsAsRead marks all unread notifications for user as read", async () => {
    // Seed 4 unread notifications for User A
    for (let i = 0; i < 4; i++) {
      await createNotification({
        recipientUserId: userAId,
        type: "MOQ_MILESTONE",
        title: `Milestone ${i}`,
        message: `Pool reached ${i * 25}% of MOQ`,
      });
    }

    const before = await listNotificationsForUser(userAId);
    expect(before.unreadCount).toBe(4);

    const result = await markAllNotificationsAsRead(userAId);
    expect(result.modifiedCount).toBe(4);

    const after = await listNotificationsForUser(userAId);
    expect(after.unreadCount).toBe(0);
  });

  // ── 6. Optional Email Dispatcher ───────────────────────────────────────────
  it("6. sendEmailNotification logs or dispatches safely without throwing", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const res = await sendEmailNotification({
      to: "shopkeeper@kirana.demo",
      subject: "Group Buy Pool Locked",
      bodyHtml: "<p>Your pool reached MOQ!</p>",
    });

    expect(res.sent).toBe(true);
    expect(res.to).toBe("shopkeeper@kirana.demo");
    consoleSpy.mockRestore();
  });

  // ── 7. HTTP Routes via Supertest ───────────────────────────────────────────
  it("7. HTTP GET /api/notifications returns user's notification feed", async () => {
    await createNotification({
      recipientUserId: userAId,
      type: "POOL_JOINED",
      title: "New Participant",
      message: "A new shop joined your pool",
    });

    const app = buildTestApp({ _id: userAId, role: "SHOP_OWNER" });
    const res = await request(app).get("/api/notifications");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.notifications).toHaveLength(1);
    expect(res.body.data.unreadCount).toBe(1);
  });

  it("8. HTTP PATCH /api/notifications/:id/read marks single notification read", async () => {
    const { notification } = await createNotification({
      recipientUserId: userAId,
      type: "EXPIRED_72H_UNDER_MOQ",
      title: "Pool Expired Under MOQ",
      message: "Please vote Proceed or Cancel within 24h",
    });

    const app = buildTestApp({ _id: userAId, role: "SHOP_OWNER" });
    const res = await request(app).patch(`/api/notifications/${notification._id}/read`);

    expect(res.status).toBe(200);
    expect(res.body.data.isRead).toBe(true);
    expect(res.body.data.readAt).toBeDefined();
  });

  it("9. HTTP PATCH /api/notifications/read-all marks all unread read", async () => {
    for (let i = 0; i < 3; i++) {
      await createNotification({
        recipientUserId: userAId,
        type: "REFUND_INITIATED",
        title: "Refund Initiated",
        message: "Partial savings delta refund initiated",
      });
    }

    const app = buildTestApp({ _id: userAId, role: "SHOP_OWNER" });
    const res = await request(app).patch("/api/notifications/read-all");

    expect(res.status).toBe(200);
    expect(res.body.data.modifiedCount).toBe(3);
  });

  it("10. HTTP GET /api/notifications returns 401 if unauthenticated", async () => {
    const app = buildTestApp(null);
    const res = await request(app).get("/api/notifications");

    expect(res.status).toBe(401);
  });
});
