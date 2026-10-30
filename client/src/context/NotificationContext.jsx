/**
 * CoBuy AI — NotificationContext (HIM-02)
 *
 * Manages in-app notification state for authenticated users.
 *
 * Contract based on actual SRU-08 backend:
 *  - GET /api/notifications returns:
 *      { notifications[], total, unreadCount, page, limit, totalPages }
 *  - PATCH /api/notifications/:id/read
 *  - PATCH /api/notifications/read-all
 *
 * Polling rules:
 *  - Only polls when user is authenticated (user !== null)
 *  - Default interval: 30 seconds
 *  - Prevents overlapping requests via in-flight flag
 *  - Cleans up interval on unmount or logout
 *  - Notification failures never crash authentication or other features
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '@/api/notifications.api';
import { useAuth } from './AuthContext';

const NotificationContext = createContext(null);

const POLL_INTERVAL_MS = 30_000; // 30 seconds

/**
 * NotificationProvider manages polling and notification state.
 */
export function NotificationProvider({ children }) {
  const { isAuthenticated } = useAuth();

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount]     = useState(0);
  const [total, setTotal]                 = useState(0);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState(null);

  const mountedRef    = useRef(true);
  const inFlightRef   = useRef(false);
  const intervalRef   = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ── Fetch Notifications ────────────────────────────────────────────────────
  /**
   * Fetch the latest page of notifications.
   * Never throws — errors are captured in state.
   */
  const loadNotifications = useCallback(async (silent = false) => {
    if (!isAuthenticated) return;
    if (inFlightRef.current) return; // prevent overlapping requests

    inFlightRef.current = true;
    if (!silent && mountedRef.current) {
      setLoading(true);
    }

    try {
      const result = await fetchNotifications({ page: 1, limit: 20 });
      if (!mountedRef.current) return;

      const { notifications: items = [], unreadCount: count = 0, total: totalCount = 0 } =
        result.data || {};

      setNotifications(items);
      setUnreadCount(count);
      setTotal(totalCount);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      // Notification failures must not break authentication or other UI
      setError(err.message || 'Failed to load notifications.');
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [isAuthenticated]);

  // ── Polling setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) {
      // User logged out — clear notifications and stop polling
      setNotifications([]);
      setUnreadCount(0);
      setTotal(0);
      setError(null);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Initial load on authentication
    loadNotifications();

    // Start polling
    intervalRef.current = setInterval(() => {
      loadNotifications(true); // silent = true to skip loading spinner during polls
    }, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isAuthenticated, loadNotifications]);

  // ── Mark One as Read ───────────────────────────────────────────────────────
  /**
   * Mark a single notification as read. Optimistic UI update.
   */
  const markAsRead = useCallback(async (notificationId) => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) =>
        n._id === notificationId ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
      )
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      await markNotificationRead(notificationId);
    } catch {
      // Revert optimistic update on failure
      if (mountedRef.current) {
        loadNotifications(true);
      }
    }
  }, [loadNotifications]);

  // ── Mark All as Read ───────────────────────────────────────────────────────
  /**
   * Mark all notifications as read. Optimistic UI update.
   */
  const markAllAsRead = useCallback(async () => {
    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() })));
    setUnreadCount(0);

    try {
      await markAllNotificationsRead();
    } catch {
      // Revert on failure
      if (mountedRef.current) {
        loadNotifications(true);
      }
    }
  }, [loadNotifications]);

  // ── Refresh ────────────────────────────────────────────────────────────────
  const refresh = useCallback(() => {
    loadNotifications();
  }, [loadNotifications]);

  const value = {
    notifications,
    unreadCount,
    total,
    loading,
    error,
    markAsRead,
    markAllAsRead,
    refresh,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

/**
 * useNotifications — hook to consume NotificationContext.
 * Must be called inside a NotificationProvider.
 */
export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (ctx === null) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return ctx;
}

export default NotificationContext;
