/**
 * CoBuy AI — Application Routing & Integration Test Suite (SUJ-10)
 *
 * Verifies:
 *  1. Provider hierarchy & default App mount (BrowserRouter -> AuthProvider -> NotificationProvider)
 *  2. Public routes (/ , /login , /register)
 *  3. Authenticated redirects (logged-in users cannot access /login or /register)
 *  4. Route protection: Unauthenticated visitors redirected to /login
 *  5. Role protection: 403 Forbidden state rendered when role is disallowed
 *  6. Role routes:
 *     - SHOP_OWNER: /dashboard, /requirements, /suppliers, /group-buys, /orders, /payments, /profile
 *     - SUPPLIER: /supplier-portal, /profile
 *     - ADMIN: /admin, /admin/suppliers, /admin/offers, /admin/pools, /admin/audit
 *     - REVIEWER: /reviewer -> /admin
 *     - COMMON: /notifications
 *  7. Future Wave Feature Placeholders inside AppShellLayout
 *  8. 404 Not Found catch-all route
 *  9. getRoleHome routing helper
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// Mock contexts for route testing
vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
  useOptionalAuth: vi.fn(),
  AuthProvider: ({ children }) => <div data-testid="auth-provider">{children}</div>,
}));

vi.mock('@/context/NotificationContext', () => ({
  useNotifications: vi.fn(),
  NotificationProvider: ({ children }) => <div data-testid="notif-provider">{children}</div>,
}));

import { useAuth, useOptionalAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import App, { AppRoutes, getRoleHome } from '@/App';

// ── Test User Personas ────────────────────────────────────────────────────────
const mockShopOwner = {
  _id: 'user-so-1',
  name: 'Anand Verma',
  email: 'cafeA@demo.aapkidukan.in',
  role: 'SHOP_OWNER',
};

const mockSupplier = {
  _id: 'user-sup-1',
  name: 'Vikram Packaging',
  email: 'supplier1@demo.aapkidukan.in',
  role: 'SUPPLIER',
};

const mockAdmin = {
  _id: 'user-admin-1',
  name: 'Platform Admin',
  email: 'admin@demo.aapkidukan.in',
  role: 'ADMIN',
};

const mockReviewer = {
  _id: 'user-rev-1',
  name: 'Auditor Reviewer',
  email: 'reviewer@demo.aapkidukan.in',
  role: 'REVIEWER',
};

function setupMockAuth({ user = null, loading = false } = {}) {
  const authState = {
    user,
    shop: user?.role === 'SHOP_OWNER' ? { name: 'Hazratganj Café' } : null,
    loading,
    authError: null,
    isAuthenticated: !!user,
    isShopOwner: user?.role === 'SHOP_OWNER',
    isSupplier: user?.role === 'SUPPLIER',
    isAdmin: user?.role === 'ADMIN',
    isReviewer: user?.role === 'REVIEWER',
    login: vi.fn().mockResolvedValue({ success: true, user }),
    register: vi.fn().mockResolvedValue({ success: true, user }),
    logout: vi.fn().mockResolvedValue({ success: true }),
    refreshUser: vi.fn(),
  };
  useAuth.mockReturnValue(authState);
  useOptionalAuth.mockReturnValue(authState);
}

function setupMockNotifications({ count = 0 } = {}) {
  useNotifications.mockReturnValue({
    notifications: [],
    unreadCount: count,
    total: count,
    loading: false,
    error: null,
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    refresh: vi.fn(),
  });
}

describe('SUJ-10: Application Routing & Provider Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMockNotifications();
  });

  // ── 1. Provider Hierarchy & Default App Mount ─────────────────────────────
  describe('Provider Architecture & App Entry', () => {
    it('renders App entry with full provider hierarchy without crashing', () => {
      setupMockAuth({ user: null });
      render(<App />);

      expect(screen.getByTestId('auth-provider')).toBeInTheDocument();
      expect(screen.getByTestId('notif-provider')).toBeInTheDocument();
      // On default path '/', LandingPage hero is rendered
      expect(screen.getByText(/WHOLESALE PRICES/i)).toBeInTheDocument();
    });

    it('maps user roles accurately via getRoleHome', () => {
      expect(getRoleHome('SHOP_OWNER')).toBe('/dashboard');
      expect(getRoleHome('SUPPLIER')).toBe('/supplier-portal');
      expect(getRoleHome('ADMIN')).toBe('/admin');
      expect(getRoleHome('REVIEWER')).toBe('/admin');
      expect(getRoleHome('UNKNOWN_ROLE')).toBe('/');
    });
  });

  // ── 2. Public Routes ───────────────────────────────────────────────────────
  describe('Public Routes', () => {
    it('renders LandingPage on path "/"', () => {
      setupMockAuth({ user: null });
      render(
        <MemoryRouter initialEntries={['/']}>
          <AppRoutes />
        </MemoryRouter>
      );

      expect(screen.getByText(/B2B REGIONAL DEMAND AGGREGATION/i)).toBeInTheDocument();
      expect(screen.getByText(/WHOLESALE PRICES/i)).toBeInTheDocument();
    });

    it('renders LoginPage on path "/login" for unauthenticated visitors', () => {
      setupMockAuth({ user: null });
      render(
        <MemoryRouter initialEntries={['/login']}>
          <AppRoutes />
        </MemoryRouter>
      );

      expect(screen.getByRole('heading', { name: /Sign in/i })).toBeInTheDocument();
      expect(screen.getByText(/Quick Demo Sign-In/i)).toBeInTheDocument();
    });

    it('renders RegisterPage on path "/register" for unauthenticated visitors', () => {
      setupMockAuth({ user: null });
      render(
        <MemoryRouter initialEntries={['/register']}>
          <AppRoutes />
        </MemoryRouter>
      );

      expect(screen.getByRole('heading', { name: /Register your business/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/Full name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Email address/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Create your account/i })).toBeInTheDocument();
    });

    it('navigates from /login to marketplace homepage "/" when clicking "← Back to Marketplace"', async () => {
      setupMockAuth({ user: null });
      render(
        <MemoryRouter initialEntries={['/login']}>
          <AppRoutes />
        </MemoryRouter>
      );

      const backLink = screen.getByRole('link', { name: /Back to Marketplace/i });
      expect(backLink).toBeInTheDocument();
      expect(backLink).toHaveAttribute('href', '/');

      await userEvent.click(backLink);

      // Successfully navigated to LandingPage without modifying auth
      expect(screen.getByText(/B2B REGIONAL DEMAND AGGREGATION/i)).toBeInTheDocument();
      expect(screen.getByText(/WHOLESALE PRICES/i)).toBeInTheDocument();
    });

    it('navigates from /register to marketplace homepage "/" when clicking "← Back to Marketplace"', async () => {
      setupMockAuth({ user: null });
      render(
        <MemoryRouter initialEntries={['/register']}>
          <AppRoutes />
        </MemoryRouter>
      );

      const backLink = screen.getByRole('link', { name: /Back to Marketplace/i });
      expect(backLink).toBeInTheDocument();
      expect(backLink).toHaveAttribute('href', '/');

      await userEvent.click(backLink);

      // Successfully navigated to LandingPage without modifying auth
      expect(screen.getByText(/B2B REGIONAL DEMAND AGGREGATION/i)).toBeInTheDocument();
      expect(screen.getByText(/WHOLESALE PRICES/i)).toBeInTheDocument();
    });
  });

  // ── 3. Authenticated Redirects on Auth Pages ──────────────────────────────
  describe('Authenticated Redirects for /login and /register', () => {
    it('redirects authenticated SHOP_OWNER from /login to /dashboard', () => {
      setupMockAuth({ user: mockShopOwner });
      render(
        <MemoryRouter initialEntries={['/login']}>
          <AppRoutes />
        </MemoryRouter>
      );

      // Should not show login form; should redirect to /dashboard
      expect(screen.queryByRole('heading', { name: /^Sign in$/i })).not.toBeInTheDocument();
      expect(screen.getByText(/Retailer Dashboard & Analytics/i)).toBeInTheDocument();
    });

    it('redirects authenticated SUPPLIER from /login to /supplier-portal', () => {
      setupMockAuth({ user: mockSupplier });
      render(
        <MemoryRouter initialEntries={['/login']}>
          <AppRoutes />
        </MemoryRouter>
      );

      expect(screen.queryByRole('heading', { name: /^Sign in$/i })).not.toBeInTheDocument();
      expect(screen.getByText(/Wholesaler Supplier Workspace/i)).toBeInTheDocument();
    });

    it('redirects authenticated ADMIN from /register to /admin', () => {
      setupMockAuth({ user: mockAdmin });
      render(
        <MemoryRouter initialEntries={['/register']}>
          <AppRoutes />
        </MemoryRouter>
      );

      expect(screen.queryByRole('heading', { name: /Register your business/i })).not.toBeInTheDocument();
      expect(screen.getByText(/Platform Administration Overview/i)).toBeInTheDocument();
    });
  });

  // ── 4. Unauthenticated Access to Protected Routes ─────────────────────────
  describe('Unauthenticated Route Guard', () => {
    it('redirects unauthenticated user accessing /dashboard to /login', async () => {
      setupMockAuth({ user: null, loading: false });
      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppRoutes />
        </MemoryRouter>
      );

      // ProtectedRoute redirects to /login which renders LoginPage
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /^Sign in$/i })).toBeInTheDocument();
      });
      expect(screen.getByText(/Quick Demo Sign-In/i)).toBeInTheDocument();
    });

    it('redirects unauthenticated user accessing /admin to /login', async () => {
      setupMockAuth({ user: null, loading: false });
      render(
        <MemoryRouter initialEntries={['/admin']}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /^Sign in$/i })).toBeInTheDocument();
      });
    });
  });

  // ── 5. Role Protection & Forbidden State ──────────────────────────────────
  describe('Role Authorization & 403 Forbidden Handling', () => {
    it('shows Forbidden state when SHOP_OWNER attempts to access /admin', () => {
      setupMockAuth({ user: mockShopOwner });
      render(
        <MemoryRouter initialEntries={['/admin']}>
          <AppRoutes />
        </MemoryRouter>
      );

      expect(screen.getByRole('heading', { name: /Access Restricted/i })).toBeInTheDocument();
      expect(screen.getByText(/does not have permission to access this page/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Return to your dashboard/i })).toBeInTheDocument();
    });

    it('shows Forbidden state when SUPPLIER attempts to access /dashboard', () => {
      setupMockAuth({ user: mockSupplier });
      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppRoutes />
        </MemoryRouter>
      );

      expect(screen.getByRole('heading', { name: /Access Restricted/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Return to your dashboard/i })).toBeInTheDocument();
    });

    it('shows Forbidden state when SHOP_OWNER attempts to access /supplier-portal', () => {
      setupMockAuth({ user: mockShopOwner });
      render(
        <MemoryRouter initialEntries={['/supplier-portal']}>
          <AppRoutes />
        </MemoryRouter>
      );

      expect(screen.getByRole('heading', { name: /Access Restricted/i })).toBeInTheDocument();
    });
  });

  // ── 6. Role Routes for SHOP_OWNER ─────────────────────────────────────────
  describe('SHOP_OWNER Protected Routes', () => {
    beforeEach(() => {
      setupMockAuth({ user: mockShopOwner });
    });

    it('renders /dashboard inside AppShellLayout', () => {
      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppRoutes />
        </MemoryRouter>
      );

      expect(screen.getByText('Retailer Dashboard & Analytics')).toBeInTheDocument();
      expect(screen.getByText('Wave 3 (HIM-06)')).toBeInTheDocument();
      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });

    it('renders /requirements inside AppShellLayout', () => {
      render(
        <MemoryRouter initialEntries={['/requirements']}>
          <AppRoutes />
        </MemoryRouter>
      );

      expect(screen.getByText('Requirements Management')).toBeInTheDocument();
      expect(screen.getByText('Wave 3 (HIM-07 / HIM-08)')).toBeInTheDocument();
    });

    it('renders /suppliers inside AppShellLayout', () => {
      render(
        <MemoryRouter initialEntries={['/suppliers']}>
          <AppRoutes />
        </MemoryRouter>
      );

      expect(screen.getByText('Supplier Catalogue & Offers')).toBeInTheDocument();
      expect(screen.getByText('Wave 3 (HIM-09)')).toBeInTheDocument();
    });

    it('renders /group-buys inside AppShellLayout', () => {
      render(
        <MemoryRouter initialEntries={['/group-buys']}>
          <AppRoutes />
        </MemoryRouter>
      );

      expect(screen.getByText('Group-Buy Pools Marketplace')).toBeInTheDocument();
      expect(screen.getByText('Wave 4 (SUJ-02 / SUJ-03)')).toBeInTheDocument();
    });

    it('renders /orders inside AppShellLayout', () => {
      render(
        <MemoryRouter initialEntries={['/orders']}>
          <AppRoutes />
        </MemoryRouter>
      );

      expect(screen.getByText('Finalized Group Orders')).toBeInTheDocument();
      expect(screen.getByText('Wave 4 (SUJ-07)')).toBeInTheDocument();
    });

    it('renders /payments inside AppShellLayout', () => {
      render(
        <MemoryRouter initialEntries={['/payments']}>
          <AppRoutes />
        </MemoryRouter>
      );

      expect(screen.getByText('Payments & Refunds Ledger')).toBeInTheDocument();
      expect(screen.getByText('Wave 4 (SUJ-06)')).toBeInTheDocument();
    });

    it('renders /profile inside AppShellLayout', () => {
      render(
        <MemoryRouter initialEntries={['/profile']}>
          <AppRoutes />
        </MemoryRouter>
      );

      expect(screen.getByText('Business Profile & Settings')).toBeInTheDocument();
      expect(screen.getByText('Wave 3 (HIM-06)')).toBeInTheDocument();
    });
  });

  // ── 7. Role Routes for SUPPLIER, ADMIN & REVIEWER ─────────────────────────
  describe('SUPPLIER, ADMIN and REVIEWER Routes', () => {
    it('renders /supplier-portal for SUPPLIER inside AppShellLayout', () => {
      setupMockAuth({ user: mockSupplier });
      render(
        <MemoryRouter initialEntries={['/supplier-portal']}>
          <AppRoutes />
        </MemoryRouter>
      );

      expect(screen.getByText('Wholesaler Supplier Workspace')).toBeInTheDocument();
      expect(screen.getByText('Wave 4 (SUJ-08)')).toBeInTheDocument();
    });

    it('renders /admin for ADMIN inside AppShellLayout', () => {
      setupMockAuth({ user: mockAdmin });
      render(
        <MemoryRouter initialEntries={['/admin']}>
          <AppRoutes />
        </MemoryRouter>
      );

      expect(screen.getByText('Platform Administration Overview')).toBeInTheDocument();
      expect(screen.getByText('Wave 4 (SUJ-09)')).toBeInTheDocument();
    });

    it('renders /admin/suppliers for ADMIN', () => {
      setupMockAuth({ user: mockAdmin });
      render(
        <MemoryRouter initialEntries={['/admin/suppliers']}>
          <AppRoutes />
        </MemoryRouter>
      );

      expect(screen.getByText('Supplier Verification & Moderation')).toBeInTheDocument();
    });

    it('renders /admin/offers for ADMIN', () => {
      setupMockAuth({ user: mockAdmin });
      render(
        <MemoryRouter initialEntries={['/admin/offers']}>
          <AppRoutes />
        </MemoryRouter>
      );

      expect(screen.getByText('Catalogue Offer Moderation')).toBeInTheDocument();
    });

    it('renders /admin/pools for ADMIN', () => {
      setupMockAuth({ user: mockAdmin });
      render(
        <MemoryRouter initialEntries={['/admin/pools']}>
          <AppRoutes />
        </MemoryRouter>
      );

      expect(screen.getByText('Pools & Reconciliation Workspace')).toBeInTheDocument();
    });

    it('renders /admin/audit for ADMIN and REVIEWER', () => {
      setupMockAuth({ user: mockReviewer });
      render(
        <MemoryRouter initialEntries={['/admin/audit']}>
          <AppRoutes />
        </MemoryRouter>
      );

      expect(screen.getByText('Audit & AI Execution Logs')).toBeInTheDocument();
    });

    it('redirects REVIEWER from /reviewer to /admin', () => {
      setupMockAuth({ user: mockReviewer });
      render(
        <MemoryRouter initialEntries={['/reviewer']}>
          <AppRoutes />
        </MemoryRouter>
      );

      expect(screen.getByText('Platform Administration Overview')).toBeInTheDocument();
    });
  });

  // ── 8. Common Routes & 404 Catch-All ───────────────────────────────────────
  describe('Common Routes & 404 Catch-All', () => {
    it('renders /notifications inside AppShellLayout for authenticated users', () => {
      setupMockAuth({ user: mockShopOwner });
      render(
        <MemoryRouter initialEntries={['/notifications']}>
          <AppRoutes />
        </MemoryRouter>
      );

      expect(screen.getByText('Notification Center')).toBeInTheDocument();
      expect(screen.getByText('Wave 4 (SUJ-07)')).toBeInTheDocument();
    });

    it('renders 404 page for unmatched routes', () => {
      setupMockAuth({ user: null });
      render(
        <MemoryRouter initialEntries={['/random-unmatched-route-xyz']}>
          <AppRoutes />
        </MemoryRouter>
      );

      expect(screen.getByRole('heading', { name: /404 — Page Not Found/i })).toBeInTheDocument();
      expect(screen.getByText(/The requested page does not exist/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Public Home/i })).toBeInTheDocument();
    });

    it('provides Return to Dashboard button on 404 page when authenticated', () => {
      setupMockAuth({ user: mockShopOwner });
      render(
        <MemoryRouter initialEntries={['/unknown-path-for-logged-in-user']}>
          <AppRoutes />
        </MemoryRouter>
      );

      expect(screen.getByRole('button', { name: /Return to Dashboard/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Public Home/i })).toBeInTheDocument();
    });
  });

  // ── 9. Marketplace Navigation Before and After Login ──────────────────────
  describe('Marketplace Navigation Before and After Login', () => {
    it('Flow 1: navigates from LoginPage to Marketplace via "← Back to Marketplace"', async () => {
      setupMockAuth({ user: null });
      render(
        <MemoryRouter initialEntries={['/login']}>
          <AppRoutes />
        </MemoryRouter>
      );
      const link = screen.getByRole('link', { name: /Back to Marketplace/i });
      await userEvent.click(link);
      expect(screen.getByText(/B2B REGIONAL DEMAND AGGREGATION/i)).toBeInTheDocument();
    });

    it('Flow 2: navigates from RegisterPage to Marketplace via "← Back to Marketplace"', async () => {
      setupMockAuth({ user: null });
      render(
        <MemoryRouter initialEntries={['/register']}>
          <AppRoutes />
        </MemoryRouter>
      );
      const link = screen.getByRole('link', { name: /Back to Marketplace/i });
      await userEvent.click(link);
      expect(screen.getByText(/B2B REGIONAL DEMAND AGGREGATION/i)).toBeInTheDocument();
    });

    it('Flow 3: authenticated SHOP_OWNER navigates to Marketplace from /dashboard', async () => {
      setupMockAuth({ user: mockShopOwner });
      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppRoutes />
        </MemoryRouter>
      );
      const marketplaceBtn = screen.getByRole('button', { name: /^marketplace$/i });
      await userEvent.click(marketplaceBtn);
      expect(screen.getByText(/B2B REGIONAL DEMAND AGGREGATION/i)).toBeInTheDocument();
    });

    it('Flow 4: authenticated SUPPLIER navigates to Marketplace from /supplier-portal', async () => {
      setupMockAuth({ user: mockSupplier });
      render(
        <MemoryRouter initialEntries={['/supplier-portal']}>
          <AppRoutes />
        </MemoryRouter>
      );
      const marketplaceBtn = screen.getByRole('button', { name: /^marketplace$/i });
      await userEvent.click(marketplaceBtn);
      expect(screen.getByText(/B2B REGIONAL DEMAND AGGREGATION/i)).toBeInTheDocument();
    });

    it('Flow 5: authenticated ADMIN navigates to Marketplace from /admin', async () => {
      setupMockAuth({ user: mockAdmin });
      render(
        <MemoryRouter initialEntries={['/admin']}>
          <AppRoutes />
        </MemoryRouter>
      );
      const marketplaceBtn = screen.getByRole('button', { name: /^marketplace$/i });
      await userEvent.click(marketplaceBtn);
      expect(screen.getByText(/B2B REGIONAL DEMAND AGGREGATION/i)).toBeInTheDocument();
    });

    it('Flow 6: authenticated REVIEWER navigates to Marketplace from /admin', async () => {
      setupMockAuth({ user: mockReviewer });
      render(
        <MemoryRouter initialEntries={['/admin']}>
          <AppRoutes />
        </MemoryRouter>
      );
      const marketplaceBtn = screen.getByRole('button', { name: /^marketplace$/i });
      await userEvent.click(marketplaceBtn);
      expect(screen.getByText(/B2B REGIONAL DEMAND AGGREGATION/i)).toBeInTheDocument();
    });

    it('Flow 7: clicking CoBuy AI logo in app header navigates to Marketplace', async () => {
      setupMockAuth({ user: mockShopOwner });
      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppRoutes />
        </MemoryRouter>
      );
      const brandLogo = screen.getByRole('button', { name: /CoBuy AI Marketplace Home/i });
      await userEvent.click(brandLogo);
      expect(screen.getByText(/B2B REGIONAL DEMAND AGGREGATION/i)).toBeInTheDocument();
    });

    it('Flow 8: clicking Marketplace sidebar link navigates to Marketplace', async () => {
      setupMockAuth({ user: mockShopOwner });
      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppRoutes />
        </MemoryRouter>
      );
      const sidebar = screen.getByLabelText('Sidebar navigation');
      const marketplaceLink = sidebar.querySelector('button');
      expect(marketplaceLink).toHaveTextContent('Marketplace');
      await userEvent.click(marketplaceLink);
      expect(screen.getByText(/B2B REGIONAL DEMAND AGGREGATION/i)).toBeInTheDocument();
    });

    it('Flow 9: confirms authentication remains active and logout is never called when navigating to /', async () => {
      const logoutMock = vi.fn();
      useAuth.mockReturnValue({
        user: mockShopOwner,
        shop: { name: 'Hazratganj Café' },
        loading: false,
        authError: null,
        isAuthenticated: true,
        logout: logoutMock,
      });

      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppRoutes />
        </MemoryRouter>
      );

      const marketplaceBtn = screen.getByRole('button', { name: /^marketplace$/i });
      await userEvent.click(marketplaceBtn);

      expect(screen.getByText(/B2B REGIONAL DEMAND AGGREGATION/i)).toBeInTheDocument();
      expect(logoutMock).not.toHaveBeenCalled();
      expect(useAuth().isAuthenticated).toBe(true);
      expect(useAuth().user.role).toBe('SHOP_OWNER');
    });

    it('Flow 10: returns to protected dashboard from marketplace without re-authenticating', async () => {
      setupMockAuth({ user: mockShopOwner });
      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppRoutes />
        </MemoryRouter>
      );

      // Step 1: Navigate to marketplace
      const marketplaceBtn = screen.getByRole('button', { name: /^marketplace$/i });
      await userEvent.click(marketplaceBtn);
      expect(screen.getByText(/B2B REGIONAL DEMAND AGGREGATION/i)).toBeInTheDocument();

      // Step 2: Return to dashboard via navbar Dashboard button
      const dashboardBtn = screen.getByRole('button', { name: /Open Dashboard/i });
      await userEvent.click(dashboardBtn);

      // Successfully back on dashboard without login screen
      expect(screen.getByText('Retailer Dashboard & Analytics')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: /^Sign in$/i })).not.toBeInTheDocument();
    });
  });
});
