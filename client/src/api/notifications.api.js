/**
 * CoBuy AI — Notifications API (HIM-02)
 *
 * Implements client-side calls for SRU-08:
 *  - GET   /notifications            (list with pagination + isRead filter)
 *  - PATCH /notifications/read-all   (mark all as read)
 *  - PATCH /notifications/:id/read   (mark single as read)
 *
 * Response structure from backend (listNotificationsForUser):
 *   { notifications, total, unreadCount, page, limit, totalPages }
 */

import axiosClient from './axiosClient';

/**
 * Fetch notifications for the authenticated user.
 *
 * @param {object} [params]
 * @param {number} [params.page=1]
 * @param {number} [params.limit=20]
 * @param {boolean} [params.isRead]  — omit to fetch all, true/false to filter
 * @returns {Promise<{ statusCode, success, message, data: { notifications, total, unreadCount, page, limit, totalPages } }>}
 */
export async function fetchNotifications(params = {}) {
  const query = {};
  if (params.page !== undefined) query.page = params.page;
  if (params.limit !== undefined) query.limit = params.limit;
  if (params.isRead !== undefined && params.isRead !== null) {
    query.isRead = params.isRead;
  }

  const response = await axiosClient.get('/notifications', { params: query });
  return response.data;
}

/**
 * Mark a single notification as read.
 *
 * @param {string} notificationId
 * @returns {Promise<{ statusCode, success, message, data: object }>}
 */
export async function markNotificationRead(notificationId) {
  const response = await axiosClient.patch(`/notifications/${notificationId}/read`);
  return response.data;
}

/**
 * Mark all unread notifications as read.
 *
 * @returns {Promise<{ statusCode, success, message, data: { modifiedCount: number } }>}
 */
export async function markAllNotificationsRead() {
  const response = await axiosClient.patch('/notifications/read-all');
  return response.data;
}

export default {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
};
