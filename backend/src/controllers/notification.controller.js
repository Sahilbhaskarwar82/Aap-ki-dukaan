import { asyncHandler } from "../utils/asyncHandler.js";
import { APIResponse } from "../utils/apiResponse.js";
import { ApiError } from "../utils/apiError.js";
import {
  listNotificationsForUser,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "../services/notifications/notification.service.js";

/**
 * GET /api/notifications
 * Lists in-app notifications for the authenticated user.
 * Query params: ?page=1&limit=20&isRead=false
 */
export const listNotifications = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  if (!userId) {
    throw new ApiError(401, "Authentication required to view notifications.");
  }

  const { isRead, page, limit } = req.query;
  const result = await listNotificationsForUser(userId, { isRead, page, limit });

  return res.status(200).json(
    new APIResponse(200, result, "Notifications retrieved successfully.")
  );
});

/**
 * PATCH /api/notifications/:id/read
 * Marks a specific notification as read.
 */
export const markRead = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  const { id } = req.params;

  if (!userId) {
    throw new ApiError(401, "Authentication required to update notification.");
  }

  const notification = await markNotificationAsRead(id, userId);

  return res.status(200).json(
    new APIResponse(200, notification, "Notification marked as read.")
  );
});

/**
 * PATCH /api/notifications/read-all
 * Marks all unread notifications for the user as read.
 */
export const markAllRead = asyncHandler(async (req, res) => {
  const userId = req.user?._id;

  if (!userId) {
    throw new ApiError(401, "Authentication required to update notifications.");
  }

  const result = await markAllNotificationsAsRead(userId);

  return res.status(200).json(
    new APIResponse(200, result, "All notifications marked as read.")
  );
});
