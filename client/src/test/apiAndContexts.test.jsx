/**
 * HIM-02 Tests — Axios Client, Auth API, AuthContext, NotificationContext
 *
 * Uses vitest + @testing-library/react.
 * Network calls are mocked via vi.fn() stubs on the imported API modules.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { buildUrl, setAuthToken, getAuthToken, clearAuthToken } from '@/api/axiosClient';

// ── 1. axiosClient URL construction ───────────────────────────────────────────
describe('axiosClient — buildUrl()', () => {
  it('concatenates baseURL and relative path correctly', () => {
    expect(buildUrl('http://localhost:8000/api', '/auth/login')).toBe(
      'http://localhost:8000/api/auth/login'
    );
  });

  it('prevents duplicate /api prefix', () => {
    expect(buildUrl('http://localhost:8000/api', '/api/auth/login')).toBe(
      'http://localhost:8000/api/auth/login'
    );
  });

  it('handles trailing slashes on base', () => {
    expect(buildUrl('http://localhost:8000/api/', '/auth/me')).toBe(
      'http://localhost:8000/api/auth/me'
    );
  });

  it('returns absolute path unchanged', () => {
    expect(buildUrl('http://localhost:8000/api', 'https://other.example.com/path')).toBe(
      'https://other.example.com/path'
    );
  });

  it('appends path without double slashes', () => {
    expect(buildUrl('http://localhost:8000/api', 'auth/me')).toBe(
      'http://localhost:8000/api/auth/me'
    );
  });
});

// ── 2. Token persistence ───────────────────────────────────────────────────────
describe('axiosClient — token storage', () => {
  beforeEach(() => {
    clearAuthToken();
    localStorage.clear();
  });

  it('stores a token and retrieves it', () => {
    setAuthToken('test-jwt-token');
    expect(getAuthToken()).toBe('test-jwt-token');
  });

  it('clears a token', () => {
    setAuthToken('test-jwt-token');
    clearAuthToken();
    expect(getAuthToken()).toBeNull();
  });

  it('persists token in localStorage during the session', () => {
    setAuthToken('persisted-token');
    // Token is readable during the session
    expect(getAuthToken()).toBe('persisted-token');
    // After clearing, token is gone from both memory and storage
    clearAuthToken();
    expect(getAuthToken()).toBeNull();
    expect(localStorage.getItem('cobuy_token')).toBeNull();
  });
});

// ── 3. AuthContext — session restoration ───────────────────────────────────────
vi.mock('@/api/auth.api', () => ({
  getCurrentUser: vi.fn(),
  loginUser:      vi.fn(),
  registerUser:   vi.fn(),
  logoutUser:     vi.fn(),
}));

vi.mock('@/api/notifications.api', () => ({
  fetchNotifications:       vi.fn(),
  markNotificationRead:     vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));

import { AuthProvider, useAuth } from '@/context/AuthContext';
import { NotificationProvider, useNotifications } from '@/context/NotificationContext';
import { getCurrentUser, loginUser, registerUser, logoutUser } from '@/api/auth.api';
import { fetchNotifications, markNotificationRead, markAllNotificationsRead } from '@/api/notifications.api';

const mockUser = {
  _id: 'user-1',
  name: 'Hazratganj Café',
  email: 'cafeA@demo.aapkidukan.in',
  role: 'SHOP_OWNER',
  status: 'ACTIVE',
};

const mockShop = {
  _id: 'shop-1',
  name: 'Hazratganj Artisan Café',
  deliveryArea: 'Hazratganj, Lucknow',
};

function AuthConsumer({ onRender }) {
  const auth = useAuth();
  onRender(auth);
  return <div data-testid="user">{auth.user?.name || 'none'}</div>;
}

function renderWithAuth(ui) {
  return render(<AuthProvider>{ui}</AuthProvider>);
}

describe('AuthContext — session restoration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAuthToken();
  });

  it('starts in loading state', async () => {
    let resolveGetMe;
    getCurrentUser.mockReturnValue(new Promise((r) => (resolveGetMe = r)));

    let capturedAuth;
    renderWithAuth(<AuthConsumer onRender={(a) => (capturedAuth = a)} />);
    expect(capturedAuth.loading).toBe(true);

    await act(async () => resolveGetMe({ data: { user: mockUser, shop: mockShop } }));
  });

  it('sets user and shop on successful session restoration', async () => {
    getCurrentUser.mockResolvedValueOnce({ data: { user: mockUser, shop: mockShop } });

    let capturedAuth;
    renderWithAuth(<AuthConsumer onRender={(a) => (capturedAuth = a)} />);

    await waitFor(() => expect(capturedAuth.loading).toBe(false));

    expect(capturedAuth.user).toEqual(mockUser);
    expect(capturedAuth.shop).toEqual(mockShop);
    expect(capturedAuth.isAuthenticated).toBe(true);
    expect(capturedAuth.isShopOwner).toBe(true);
  });

  it('clears state and does not crash on 401 (unauthenticated)', async () => {
    const err = Object.assign(new Error('Not authenticated'), { status: 401 });
    getCurrentUser.mockRejectedValueOnce(err);

    let capturedAuth;
    renderWithAuth(<AuthConsumer onRender={(a) => (capturedAuth = a)} />);

    await waitFor(() => expect(capturedAuth.loading).toBe(false));

    expect(capturedAuth.user).toBeNull();
    expect(capturedAuth.isAuthenticated).toBe(false);
  });
});

// ── 4. AuthContext — login ─────────────────────────────────────────────────────
describe('AuthContext — login()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAuthToken();
    // Default: session restoration fails with 401
    const err = Object.assign(new Error('Unauthorized'), { status: 401 });
    getCurrentUser.mockRejectedValue(err);
  });

  it('sets user on successful login', async () => {
    loginUser.mockResolvedValueOnce({
      data: { user: mockUser, shop: mockShop, token: 'jwt-abc' },
    });

    let capturedAuth;
    renderWithAuth(<AuthConsumer onRender={(a) => (capturedAuth = a)} />);
    await waitFor(() => expect(capturedAuth.loading).toBe(false));

    let result;
    await act(async () => {
      result = await capturedAuth.login({ email: 'cafeA@demo.aapkidukan.in', password: 'Demo@1234' });
    });

    expect(result.success).toBe(true);
    expect(capturedAuth.user).toEqual(mockUser);
    expect(getAuthToken()).toBe('jwt-abc');
  });

  it('returns error and keeps user null on failed login', async () => {
    const err = Object.assign(new Error('Invalid email or password.'), {
      status: 401,
      errors: ['INVALID_CREDENTIALS'],
    });
    loginUser.mockRejectedValueOnce(err);

    let capturedAuth;
    renderWithAuth(<AuthConsumer onRender={(a) => (capturedAuth = a)} />);
    await waitFor(() => expect(capturedAuth.loading).toBe(false));

    let result;
    await act(async () => {
      result = await capturedAuth.login({ email: 'bad@email.com', password: 'wrong' });
    });

    expect(result.success).toBe(false);
    expect(result.errors).toContain('INVALID_CREDENTIALS');
    expect(capturedAuth.user).toBeNull();
  });

  it('does not treat a network error as successful login', async () => {
    const netErr = Object.assign(new Error('Network connection failed.'), { isNetworkError: true });
    loginUser.mockRejectedValueOnce(netErr);

    let capturedAuth;
    renderWithAuth(<AuthConsumer onRender={(a) => (capturedAuth = a)} />);
    await waitFor(() => expect(capturedAuth.loading).toBe(false));

    let result;
    await act(async () => {
      result = await capturedAuth.login({ email: 'a@b.com', password: '123' });
    });

    expect(result.success).toBe(false);
    expect(capturedAuth.user).toBeNull();
  });
});

// ── 5. AuthContext — logout ────────────────────────────────────────────────────
describe('AuthContext — logout()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAuthToken();
  });

  it('clears user state after logout', async () => {
    getCurrentUser.mockResolvedValueOnce({ data: { user: mockUser, shop: mockShop } });
    logoutUser.mockResolvedValueOnce({ data: null, message: 'Logged out' });

    let capturedAuth;
    renderWithAuth(<AuthConsumer onRender={(a) => (capturedAuth = a)} />);
    await waitFor(() => expect(capturedAuth.loading).toBe(false));
    expect(capturedAuth.user).toEqual(mockUser);

    await act(async () => capturedAuth.logout());

    expect(capturedAuth.user).toBeNull();
    expect(capturedAuth.isAuthenticated).toBe(false);
    expect(getAuthToken()).toBeNull();
  });

  it('clears user even if logout API fails', async () => {
    getCurrentUser.mockResolvedValueOnce({ data: { user: mockUser, shop: null } });
    logoutUser.mockRejectedValueOnce(new Error('Server error'));

    let capturedAuth;
    renderWithAuth(<AuthConsumer onRender={(a) => (capturedAuth = a)} />);
    await waitFor(() => expect(capturedAuth.loading).toBe(false));

    await act(async () => capturedAuth.logout());

    expect(capturedAuth.user).toBeNull();
  });
});

// ── 6. AuthContext — role flags ────────────────────────────────────────────────
describe('AuthContext — role flags', () => {
  const cases = [
    { role: 'SHOP_OWNER', isShopOwner: true,  isSupplier: false, isAdmin: false, isReviewer: false },
    { role: 'SUPPLIER',   isShopOwner: false, isSupplier: true,  isAdmin: false, isReviewer: false },
    { role: 'ADMIN',      isShopOwner: false, isSupplier: false, isAdmin: true,  isReviewer: false },
    { role: 'REVIEWER',   isShopOwner: false, isSupplier: false, isAdmin: false, isReviewer: true  },
  ];

  cases.forEach(({ role, ...flags }) => {
    it(`sets correct flags for role ${role}`, async () => {
      vi.clearAllMocks();
      clearAuthToken();
      getCurrentUser.mockResolvedValueOnce({
        data: { user: { ...mockUser, role }, shop: null },
      });

      let capturedAuth;
      renderWithAuth(<AuthConsumer onRender={(a) => (capturedAuth = a)} />);
      await waitFor(() => expect(capturedAuth.loading).toBe(false));

      Object.entries(flags).forEach(([flag, expected]) => {
        expect(capturedAuth[flag]).toBe(expected);
      });
    });
  });
});

// ── 7. NotificationContext — fetching ─────────────────────────────────────────
const mockNotifResponse = {
  data: {
    notifications: [
      { _id: 'n1', type: 'POOL_CREATED', title: 'New Pool', message: 'A pool opened', isRead: false, createdAt: '2026-01-01T00:00:00Z' },
      { _id: 'n2', type: 'PAYMENT_CAPTURED', title: 'Payment OK', message: 'Paid', isRead: true, createdAt: '2026-01-01T01:00:00Z' },
    ],
    total: 2,
    unreadCount: 1,
    page: 1,
    limit: 20,
    totalPages: 1,
  },
};

function NotifConsumer({ onRender }) {
  const auth = useAuth();
  const ctx = useNotifications();
  onRender(ctx);
  return (
    <div>
      <span data-testid="auth-loading">{String(auth.loading)}</span>
      <div data-testid="unread">{ctx.unreadCount}</div>
    </div>
  );
}

function renderWithBoth(ui) {
  return render(
    <AuthProvider>
      <NotificationProvider>{ui}</NotificationProvider>
    </AuthProvider>
  );
}

describe('NotificationContext — fetching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAuthToken();
  });

  it('fetches notifications when user is authenticated', async () => {
    getCurrentUser.mockResolvedValueOnce({ data: { user: mockUser, shop: null } });
    fetchNotifications.mockResolvedValueOnce(mockNotifResponse);

    let capturedCtx;
    renderWithBoth(<NotifConsumer onRender={(c) => (capturedCtx = c)} />);

    await waitFor(() => expect(fetchNotifications).toHaveBeenCalled());
    await waitFor(() => expect(capturedCtx.notifications.length).toBe(2));
    expect(capturedCtx.unreadCount).toBe(1);
  });

  it('does not fetch notifications when unauthenticated', async () => {
    const err = Object.assign(new Error('Unauthorized'), { status: 401 });
    getCurrentUser.mockRejectedValueOnce(err);

    let capturedCtx;
    renderWithBoth(<NotifConsumer onRender={(c) => (capturedCtx = c)} />);

    // Wait until AuthProvider completes session restoration cleanly
    await waitFor(() => expect(screen.getByTestId('auth-loading')).toHaveTextContent('false'));
    expect(fetchNotifications).not.toHaveBeenCalled();
    expect(capturedCtx.notifications).toEqual([]);
  });

  it('handles notification fetch failure without crashing', async () => {
    getCurrentUser.mockResolvedValueOnce({ data: { user: mockUser, shop: null } });
    fetchNotifications.mockRejectedValueOnce(new Error('Network error'));

    let capturedCtx;
    renderWithBoth(<NotifConsumer onRender={(c) => (capturedCtx = c)} />);

    await waitFor(() => expect(fetchNotifications).toHaveBeenCalled());
    await waitFor(() => expect(capturedCtx.loading).toBe(false));

    expect(capturedCtx.notifications).toEqual([]);
    expect(capturedCtx.error).toBeTruthy();
  });
});

// ── 8. NotificationContext — mark as read ─────────────────────────────────────
describe('NotificationContext — markAsRead()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAuthToken();
  });

  it('optimistically marks a notification as read', async () => {
    getCurrentUser.mockResolvedValueOnce({ data: { user: mockUser, shop: null } });
    fetchNotifications.mockResolvedValueOnce(mockNotifResponse);
    markNotificationRead.mockResolvedValueOnce({ data: { _id: 'n1', isRead: true } });

    let capturedCtx;
    renderWithBoth(<NotifConsumer onRender={(c) => (capturedCtx = c)} />);

    await waitFor(() => expect(capturedCtx.notifications.length).toBe(2));

    await act(async () => capturedCtx.markAsRead('n1'));

    const updated = capturedCtx.notifications.find((n) => n._id === 'n1');
    expect(updated.isRead).toBe(true);
    expect(capturedCtx.unreadCount).toBe(0);
  });

  it('marks all notifications as read', async () => {
    getCurrentUser.mockResolvedValueOnce({ data: { user: mockUser, shop: null } });
    fetchNotifications.mockResolvedValueOnce(mockNotifResponse);
    markAllNotificationsRead.mockResolvedValueOnce({ data: { modifiedCount: 1 } });

    let capturedCtx;
    renderWithBoth(<NotifConsumer onRender={(c) => (capturedCtx = c)} />);

    await waitFor(() => expect(capturedCtx.notifications.length).toBe(2));

    await act(async () => capturedCtx.markAllAsRead());

    expect(capturedCtx.unreadCount).toBe(0);
    capturedCtx.notifications.forEach((n) => expect(n.isRead).toBe(true));
  });
});
