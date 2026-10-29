import mongoose from "mongoose";
import { Notification, NOTIFICATION_TYPES } from "../../models/Notification.model.js";
import { ApiError } from "../../utils/apiError.js";

/**
 * Optional email dispatcher (pluggable transport or logged simulation).
 */
export async function sendEmailNotification(emailOptions = {}) {
  try {
    const { to, subject, bodyHtml, text } = emailOptions;
    if (!to || (!subject && !bodyHtml && !text)) {
      return { sent: false, reason: "Missing required email recipient or content" };
    }

    // In prototype/sandbox mode: simulate or log email dispatch
    // Real SMTP integration can hook here if SMTP_HOST is configured
    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
      // Dynamic import if nodemailer is available in future
      console.log(`[Email Dispatcher] Sending email to ${to}: "${subject}"`);
    } else {
      console.log(
        `[Email Dispatcher — SIMULATED] Simulated email to <${to}> | Subject: "${subject}"`
      );
    }

    return { sent: true, simulated: !process.env.SMTP_HOST, to, subject };
  } catch (err) {
    console.error("[Email Dispatcher Error] Failed to send email:", err.message);
    return { sent: false, error: err.message };
  }
}

/**
 * Task SRU-08: Creates a persistent in-app notification.
 *
 * CRITICAL RULE (FR-NOTIF-004):
 * This function is protected by a non-throwing try/catch boundary.
 * A notification or email dispatch failure must NEVER throw or roll back
 * order finalization, payment capture, pool transition, or refund processing.
 *
 * @param {object} params
 * @param {string|mongoose.Types.ObjectId} params.recipientUserId Required
 * @param {string|mongoose.Types.ObjectId} [params.shopId]
 * @param {string} params.type One of the 19 NOTIFICATION_TYPES
 * @param {string} params.title
 * @param {string} params.message
 * @param {string} [params.linkUrl]
 * @param {string|mongoose.Types.ObjectId} [params.relatedPoolId]
 * @param {string|mongoose.Types.ObjectId} [params.relatedOrderId]
 * @param {object} [params.metadata]
 * @param {object} [params.emailOptions] Optional email to dispatch
 * @param {boolean} [params.throwOnError=false] Test-only flag to allow asserting validation
 * @returns {Promise<{ success: boolean, notification?: object, error?: string }>}
 */
export async function createNotification(params) {
  try {
    const {
      recipientUserId,
      shopId = null,
      type,
      title,
      message,
      linkUrl = "/dashboard",
      relatedPoolId = null,
      relatedOrderId = null,
      metadata = {},
      emailOptions = null,
      throwOnError = false,
    } = params;

    if (!recipientUserId) {
      const err = new ApiError(400, "recipientUserId is required for creating a notification.");
      if (throwOnError) throw err;
      console.warn("[NotificationService] Notification skipped: missing recipientUserId.");
      return { success: false, error: err.message };
    }

    if (!type || !NOTIFICATION_TYPES.includes(type)) {
      const err = new ApiError(
        400,
        `Invalid notification type: '${type}'. Must be one of the 19 supported lifecycle types.`
      );
      if (throwOnError) throw err;
      console.warn(`[NotificationService] Notification skipped: ${err.message}`);
      return { success: false, error: err.message };
    }

    if (!title || !message) {
      const err = new ApiError(400, "Title and message are required for notification.");
      if (throwOnError) throw err;
      console.warn(`[NotificationService] Notification skipped: ${err.message}`);
      return { success: false, error: err.message };
    }

    const notification = await Notification.create({
      recipientUserId,
      shopId,
      type,
      title: title.trim(),
      message: message.trim(),
      linkUrl: linkUrl.trim(),
      relatedPoolId,
      relatedOrderId,
      metadata,
    });

    // Optional email dispatch (non-blocking)
    if (emailOptions && emailOptions.to) {
      sendEmailNotification(emailOptions).catch((emailErr) => {
        console.error("[NotificationService] Async email dispatch failed:", emailErr.message);
      });
    }

    return { success: true, notification };
  } catch (err) {
    // Non-throwing boundary protects business transactions
    console.error("[NotificationService] Failed to create notification:", err.message);
    if (params?.throwOnError) {
      throw err;
    }
    return { success: false, error: err.message };
  }
}

/**
 * Lists notifications for a given user with pagination and optional unread filter.
 *
 * @param {string|mongoose.Types.ObjectId} userId
 * @param {object} options { isRead: boolean, page: number, limit: number }
 * @returns {Promise<{ notifications: object[], total: number, unreadCount: number, page: number, limit: number }>}
 */
export async function listNotificationsForUser(userId, options = {}) {
  const page = Math.max(1, parseInt(options.page || 1, 10));
  const limit = Math.min(100, Math.max(1, parseInt(options.limit || 20, 10)));
  const skip = (page - 1) * limit;

  const filter = { recipientUserId: userId };
  if (options.isRead !== undefined && options.isRead !== null && options.isRead !== "") {
    filter.isRead = options.isRead === true || options.isRead === "true";
  }

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ recipientUserId: userId, isRead: false }),
  ]);

  return {
    notifications,
    total,
    unreadCount,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

/**
 * Marks a single notification as read after validating ownership.
 *
 * @param {string|mongoose.Types.ObjectId} notificationId
 * @param {string|mongoose.Types.ObjectId} userId
 * @returns {Promise<mongoose.Document>}
 */
export async function markNotificationAsRead(notificationId, userId) {
  const notification = await Notification.findById(notificationId);

  if (!notification) {
    throw new ApiError(404, `Notification ${notificationId} not found.`);
  }

  // Ownership verification
  if (notification.recipientUserId.toString() !== userId.toString()) {
    throw new ApiError(403, "Forbidden: You cannot modify another user's notification.");
  }

  if (!notification.isRead) {
    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();
  }

  return notification;
}

/**
 * Marks all unread notifications for a user as read.
 *
 * @param {string|mongoose.Types.ObjectId} userId
 * @returns {Promise<{ modifiedCount: number }>}
 */
export async function markAllNotificationsAsRead(userId) {
  const result = await Notification.updateMany(
    { recipientUserId: userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );

  return { modifiedCount: result.modifiedCount };
}

export default {
  createNotification,
  sendEmailNotification,
  listNotificationsForUser,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  NOTIFICATION_TYPES,
};
