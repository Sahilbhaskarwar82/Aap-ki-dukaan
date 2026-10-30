/**
 * HIM-05 Tests — AppShellLayout, Role-Based Navigation & ProtectedRoute
 *
 * Tests cover:
 *  - Unauthenticated access handling & redirection
 *  - Authenticated access rendering children
 *  - Session restoration loading skeleton
 *  - Role-specific navigation items (SHOP_OWNER, SUPPLIER, ADMIN, REVIEWER)
 *  - Wholesalers do not see retailer links; retailers do not see wholesaler links
 *  - Admin and Reviewer do not see buyer links
 *  - Role-based route guard: Forbidden state when role is disallowed
 *  - Active nav link aria-current="page"
 *  - Notification bell badge from NotificationContext
 *  - Mobile navigation drawer open/close
 *  - Sign out triggers logout()
 *  - Safe handling of missing/malformed user
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock contexts
vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/context/NotificationContext', () => ({
  useNotifications: vi.fn(),
}));

import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import AppShellLayout, { getNavItemsForRole } from '@/layouts/AppShellLayout';
import ProtectedRoute from '@/components/auth/ProtectedRoute';

// ── Shared test fixtures ───────────────────────────────────────────────────────
const mockShopOwner = {
  _id: 'user-so',
  name: 'Café Owner',
  email: 'cafe@lucknow.in',
  role: 'SHOP_OWNER',
};

const mockSupplier = {
  _id: 'user-sup',
  name: 'Wholesaler One',
  email: 'supplier@lucknow.in',
  role: 'SUPPLIER',
};

const mockAdmin = {
  _id: 'user-admin',
  name: 'Admin User',
  email: 'admin@lucknow.in',
  role: 'ADMIN',
};

const mockReviewer = {
  _id: 'user-rev',
  name: 'Reviewer User',
  email: 'reviewer@lucknow.in',
  role: 'REVIEWER',
};

const mockShop = {
  _id: 'shop-1',
  name: 'Hazratganj Café',
};

function setupShell({ user = mockShopOwner, shop = mockShop, logout = vi.fn() } = {}, notif = {}) {
  useAuth.mockReturnValue({
    user,
    shop,
    logout,
    isAuthenticated: !!user,
    loading: false,
  });

  useNotifications.mockReturnValue({
    notifications: notif.notifications || [],
    unreadCount: notif.unreadCount || 0,
    markAsRead: notif.markAsRead || vi.fn(),
    markAllAsRead: notif.markAllAsRead || vi.fn(),
    refresh: vi.fn(),
    loading: false,
  });

  return { logout };
}

// ── 1. Role-Based Navigation Item Logic ────────────────────────────────────────
describe('HIM-05: getNavItemsForRole()', () => {
  it('returns 9 navigation items for SHOP_OWNER including Marketplace', () => {
    const items = getNavItemsForRole('SHOP_OWNER');
    expect(items.length).toBe(9);
    const labels = items.map((i) => i.label);
    expect(labels).toContain('Marketplace');
    expect(labels).toContain('Dashboard');
    expect(labels).toContain('Requirements');
    expect(labels).toContain('Supplier Catalogue');
    expect(labels).toContain('Group Buys');
    expect(labels).toContain('Orders');
    expect(labels).toContain('Payments & Refunds');
    expect(labels).toContain('Shop Profile');
    // Must NOT contain supplier portal
    expect(labels).not.toContain('Supplier Portal');
  });

  it('returns supplier-specific navigation for SUPPLIER including Marketplace', () => {
    const items = getNavItemsForRole('SUPPLIER');
    const labels = items.map((i) => i.label);
    expect(labels).toContain('Marketplace');
    expect(labels).toContain('Supplier Portal');
    // Must NOT contain buyer items
    expect(labels).not.toContain('Requirements');
    expect(labels).not.toContain('Group Buys');
    expect(labels).not.toContain('Shop Profile');
  });

  it('returns admin items for ADMIN including Marketplace', () => {
    const items = getNavItemsForRole('ADMIN');
    const labels = items.map((i) => i.label);
    expect(labels).toContain('Marketplace');
    expect(labels).toContain('Admin Overview');
    expect(labels).toContain('Manage Suppliers');
    expect(labels).toContain('Manage Offers');
    expect(labels).toContain('Pools & Reconciliation');
    expect(labels).toContain('Audit & AI Logs');
    // Admins are not ordinary buyers
    expect(labels).not.toContain('Group Buys');
  });

  it('returns read-only audit/admin items for REVIEWER including Marketplace', () => {
    const items = getNavItemsForRole('REVIEWER');
    const labels = items.map((i) => i.label);
    expect(labels).toContain('Marketplace');
    expect(labels).toContain('Admin Overview');
    expect(labels).toContain('Audit & AI Logs');
    // Reviewers do not have supplier/offer management
    expect(labels).not.toContain('Manage Suppliers');
    expect(labels).not.toContain('Manage Offers');
  });

  it('returns empty array for unknown or missing role', () => {
    expect(getNavItemsForRole(null)).toEqual([]);
    expect(getNavItemsForRole('HACKER')).toEqual([]);
  });
});

// ── 2. AppShellLayout — Rendering & Role Separation ────────────────────────────
describe('HIM-05: AppShellLayout rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders children inside the main content area', () => {
    setupShell();
    render(
      <AppShellLayout>
        <div data-testid="child-content">Active Pool Content</div>
      </AppShellLayout>
    );
    expect(screen.getByTestId('child-content')).toBeInTheDocument();
  });

  it('displays user name and shop name in header', () => {
    setupShell({ user: mockShopOwner, shop: mockShop });
    render(<AppShellLayout><div>Page</div></AppShellLayout>);
    expect(screen.getAllByText('Café Owner').length).toBeGreaterThan(0);
    expect(screen.getByText('Hazratganj Café')).toBeInTheDocument();
  });

  it('renders correct navigation links for SHOP_OWNER in sidebar', () => {
    setupShell({ user: mockShopOwner });
    render(<AppShellLayout><div>Page</div></AppShellLayout>);
    const sidebar = screen.getByLabelText('Sidebar navigation');
    expect(sidebar).toHaveTextContent('Requirements');
    expect(sidebar).toHaveTextContent('Group Buys');
    expect(sidebar).toHaveTextContent('Supplier Catalogue');
    expect(sidebar).not.toHaveTextContent('Supplier Portal');
  });

  it('renders correct navigation links for SUPPLIER in sidebar', () => {
    setupShell({ user: mockSupplier, shop: null });
    render(<AppShellLayout><div>Page</div></AppShellLayout>);
    const sidebar = screen.getByLabelText('Sidebar navigation');
    expect(sidebar).toHaveTextContent('Supplier Portal');
    expect(sidebar).not.toHaveTextContent('Requirements');
    expect(sidebar).not.toHaveTextContent('Group Buys');
  });

  it('marks active navigation link with aria-current="page"', () => {
    setupShell({ user: mockShopOwner });
    render(
      <AppShellLayout currentPath="/requirements">
        <div>Requirements Page</div>
      </AppShellLayout>
    );
    const activeBtn = screen.getByRole('button', { name: /requirements/i });
    expect(activeBtn).toHaveAttribute('aria-current', 'page');

    const inactiveBtn = screen.getByRole('button', { name: /group buys/i });
    expect(inactiveBtn).not.toHaveAttribute('aria-current');
  });

  it('renders notification badge with correct unread count', () => {
    setupShell({}, { unreadCount: 5 });
    render(<AppShellLayout><div>Page</div></AppShellLayout>);
    const badge = screen.getByTestId('unread-badge');
    expect(badge).toHaveTextContent('5');
  });

  it('does not render notification badge when unreadCount is 0', () => {
    setupShell({}, { unreadCount: 0 });
    render(<AppShellLayout><div>Page</div></AppShellLayout>);
    expect(screen.queryByTestId('unread-badge')).not.toBeInTheDocument();
  });

  it('opens and closes mobile drawer on hamburger toggle', async () => {
    setupShell();
    render(<AppShellLayout><div>Page</div></AppShellLayout>);

    const openBtn = screen.getByLabelText('Open navigation menu');
    await userEvent.click(openBtn);

    expect(screen.getByRole('dialog', { name: /mobile navigation/i })).toBeInTheDocument();

    const closeBtn = screen.getByLabelText('Close menu');
    await userEvent.click(closeBtn);

    expect(screen.queryByRole('dialog', { name: /mobile navigation/i })).not.toBeInTheDocument();
  });

  it('triggers logout from sidebar button', async () => {
    const { logout } = setupShell();
    render(<AppShellLayout><div>Page</div></AppShellLayout>);

    const sidebar = screen.getByLabelText('Sidebar navigation');
    const signOutBtn = sidebar.querySelector('div.mt-auto button');
    await userEvent.click(signOutBtn);

    expect(logout).toHaveBeenCalled();
  });

  it('clicking CoBuy AI brand logo calls onNavigate with "/"', async () => {
    const onNavigate = vi.fn();
    setupShell({ user: mockShopOwner });
    render(<AppShellLayout onNavigate={onNavigate}><div>Page</div></AppShellLayout>);

    const brandBtn = screen.getByRole('button', { name: /CoBuy AI Marketplace Home/i });
    await userEvent.click(brandBtn);

    expect(onNavigate).toHaveBeenCalledWith('/');
  });

  it('clicking Marketplace sidebar link calls onNavigate with "/"', async () => {
    const onNavigate = vi.fn();
    setupShell({ user: mockShopOwner });
    render(<AppShellLayout onNavigate={onNavigate}><div>Page</div></AppShellLayout>);

    const marketplaceBtn = screen.getByRole('button', { name: /^marketplace$/i });
    await userEvent.click(marketplaceBtn);

    expect(onNavigate).toHaveBeenCalledWith('/');
  });

  it('renders Marketplace link for all roles (SHOP_OWNER, SUPPLIER, ADMIN, REVIEWER)', () => {
    const roleUsers = [mockShopOwner, mockSupplier, mockAdmin, mockReviewer];
    for (const u of roleUsers) {
      setupShell({ user: u });
      const { unmount } = render(
        <AppShellLayout>
          <div>Content</div>
        </AppShellLayout>
      );
      const sidebar = screen.getByLabelText('Sidebar navigation');
      expect(sidebar).toHaveTextContent('Marketplace');
      unmount();
    }
  });
});

// ── 3. ProtectedRoute — Access Control ─────────────────────────────────────────
describe('HIM-05: ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading skeleton while session is restoring', () => {
    useAuth.mockReturnValue({
      user: null,
      loading: true,
      isAuthenticated: false,
    });

    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    expect(screen.getByRole('status', { name: /checking authentication/i })).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('renders unauthenticated state and calls onRedirect when not logged in', () => {
    const onRedirect = vi.fn();
    useAuth.mockReturnValue({
      user: null,
      loading: false,
      isAuthenticated: false,
    });

    render(
      <ProtectedRoute onRedirect={onRedirect}>
        <div>Secret Admin Content</div>
      </ProtectedRoute>
    );

    expect(screen.getByRole('heading', { name: /authentication required/i })).toBeInTheDocument();
    expect(screen.queryByText('Secret Admin Content')).not.toBeInTheDocument();
    expect(onRedirect).toHaveBeenCalledWith('/login');
  });

  it('renders children when authenticated with no role restrictions', () => {
    useAuth.mockReturnValue({
      user: mockShopOwner,
      loading: false,
      isAuthenticated: true,
    });

    render(
      <ProtectedRoute>
        <div>Any Authenticated Page</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('Any Authenticated Page')).toBeInTheDocument();
  });

  it('renders children when user role matches allowedRoles', () => {
    useAuth.mockReturnValue({
      user: mockShopOwner,
      loading: false,
      isAuthenticated: true,
    });

    render(
      <ProtectedRoute allowedRoles={['SHOP_OWNER']}>
        <div>Retailer Dashboard</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('Retailer Dashboard')).toBeInTheDocument();
  });

  it('renders forbidden state when user role is not in allowedRoles', () => {
    useAuth.mockReturnValue({
      user: mockSupplier, // Wholesaler trying to access buyer page
      loading: false,
      isAuthenticated: true,
    });

    render(
      <ProtectedRoute allowedRoles={['SHOP_OWNER']}>
        <div>Buyer-Only Page</div>
      </ProtectedRoute>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/access restricted/i)).toBeInTheDocument();
    expect(screen.queryByText('Buyer-Only Page')).not.toBeInTheDocument();
  });

  it('handles missing user safely without throwing', () => {
    useAuth.mockReturnValue({
      user: null,
      loading: false,
      isAuthenticated: false,
    });

    expect(() => {
      render(
        <ProtectedRoute allowedRoles={['ADMIN']}>
          <div>Admin</div>
        </ProtectedRoute>
      );
    }).not.toThrow();
  });
});
