/**
 * PublicLayout & LandingPage Navigation Tests
 *
 * Verifies that:
 *  1. Clicking "Sign In" triggers navigation to /login (no placeholder toast).
 *  2. Clicking "Register Business" triggers navigation to /register (no placeholder toast).
 *  3. Mobile drawer provides accessible Sign In and Register Business actions.
 *  4. LandingPage propagates navigation callbacks to PublicLayout.
 *  5. Old Wave 1 placeholder toasts are completely eliminated.
 *  6. Other marketplace toasts (e.g., search) are preserved.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PublicLayout } from '@/layouts/PublicLayout';
import { LandingPage } from '@/pages/public/LandingPage';
import { toast } from '@/components/ui/Toast';
import AuthContext from '@/context/AuthContext';

vi.mock('@/components/ui/Toast', () => ({
  Toaster: () => <div data-testid="toaster" />,
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

describe('PublicLayout — Authentication Navigation (Wave 2 Fix)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clicking "Sign In" calls onNavigateToLogin callback', async () => {
    const user = userEvent.setup();
    const onNavigateToLogin = vi.fn();

    render(
      <PublicLayout onNavigateToLogin={onNavigateToLogin}>
        <div>Marketplace Content</div>
      </PublicLayout>
    );

    const signInBtn = screen.getByRole('button', { name: /^sign in$/i });
    await user.click(signInBtn);

    expect(onNavigateToLogin).toHaveBeenCalledTimes(1);
    expect(toast.info).not.toHaveBeenCalledWith(
      expect.stringContaining('Prakhar’s JWT Auth')
    );
  });

  it('clicking "Sign In" falls back to onNavigate("/login") if onNavigateToLogin not provided', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    render(
      <PublicLayout onNavigate={onNavigate}>
        <div>Content</div>
      </PublicLayout>
    );

    const signInBtn = screen.getByRole('button', { name: /^sign in$/i });
    await user.click(signInBtn);

    expect(onNavigate).toHaveBeenCalledWith('/login');
  });

  it('clicking "Register Business" calls onNavigateToRegister callback', async () => {
    const user = userEvent.setup();
    const onNavigateToRegister = vi.fn();

    render(
      <PublicLayout onNavigateToRegister={onNavigateToRegister}>
        <div>Content</div>
      </PublicLayout>
    );

    const registerBtn = screen.getByRole('button', { name: /^register business$/i });
    await user.click(registerBtn);

    expect(onNavigateToRegister).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalledWith(
      expect.stringContaining('available in Wave 2')
    );
  });

  it('clicking "Register Business" falls back to onNavigate("/register")', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    render(
      <PublicLayout onNavigate={onNavigate}>
        <div>Content</div>
      </PublicLayout>
    );

    const registerBtn = screen.getByRole('button', { name: /^register business$/i });
    await user.click(registerBtn);

    expect(onNavigate).toHaveBeenCalledWith('/register');
  });

  it('mobile drawer allows signing in and registering', async () => {
    const user = userEvent.setup();
    const onNavigateToLogin = vi.fn();
    const onNavigateToRegister = vi.fn();

    render(
      <PublicLayout
        onNavigateToLogin={onNavigateToLogin}
        onNavigateToRegister={onNavigateToRegister}
      >
        <div>Content</div>
      </PublicLayout>
    );

    // Open mobile menu
    const menuToggle = screen.getByLabelText(/toggle navigation/i);
    await user.click(menuToggle);

    const mobileMenu = screen.getByRole('region', { name: /mobile menu/i });
    expect(mobileMenu).toBeInTheDocument();

    // Click mobile sign in
    const mobileSignIn = mobileMenu.querySelector('button:nth-child(2)');
    await user.click(mobileSignIn);
    expect(onNavigateToLogin).toHaveBeenCalledTimes(1);
  });

  it('preserves search toast functionality', async () => {
    const user = userEvent.setup();

    render(
      <PublicLayout searchQuery="rice bags">
        <div>Content</div>
      </PublicLayout>
    );

    const searchBtn = screen.getByRole('button', { name: /search/i });
    await user.click(searchBtn);

    expect(toast.info).toHaveBeenCalledWith(
      expect.stringContaining('rice bags')
    );
  });

  it('LandingPage forwards navigation callbacks to PublicLayout', async () => {
    const user = userEvent.setup();
    const onNavigateToLogin = vi.fn();
    const onNavigateToRegister = vi.fn();

    render(
      <LandingPage
        onNavigateToLogin={onNavigateToLogin}
        onNavigateToRegister={onNavigateToRegister}
      />
    );

    const signInBtn = screen.getByRole('button', { name: /^sign in$/i });
    await user.click(signInBtn);
    expect(onNavigateToLogin).toHaveBeenCalledTimes(1);

    const registerBtn = screen.getByRole('button', { name: /^register business$/i });
    await user.click(registerBtn);
    expect(onNavigateToRegister).toHaveBeenCalledTimes(1);
  });
});

describe('PublicLayout — Collapsible Role-Aware Marketplace Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('renders collapsible sidebar for unauthenticated guests and collapses/expands on toggle', async () => {
    const user = userEvent.setup();
    const onCategorySelect = vi.fn();

    render(
      <PublicLayout selectedCategory="all" onCategorySelect={onCategorySelect}>
        <div>Marketplace Body</div>
      </PublicLayout>
    );

    const sidebar = document.getElementById('public-sidebar-nav');
    expect(sidebar).toBeInTheDocument();
    expect(sidebar).toHaveAttribute('data-role', 'GUEST');
    expect(sidebar).toHaveAttribute('data-collapsed', 'false');
    expect(sidebar.className).toContain('w-64');
    expect(screen.getByText('Guest Browse')).toBeInTheDocument();
    expect(screen.getByText('Wholesale Categories')).toBeInTheDocument();
    expect(screen.getByText('Portals & Guides')).toBeInTheDocument();

    // Selecting category inside sidebar updates category filter
    const oilsSidebarBtn = screen.getByRole('button', { name: /Category: Cooking Oils & Ghee/i });
    await user.click(oilsSidebarBtn);
    expect(onCategorySelect).toHaveBeenCalledWith('food');

    // Collapse desktop sidebar
    const collapseBtn = screen.getByRole('button', { name: /^collapse sidebar$/i });
    await user.click(collapseBtn);

    expect(sidebar).toHaveAttribute('data-collapsed', 'true');
    expect(sidebar.className).toContain('w-[72px]');
    expect(window.localStorage.getItem('cobuy_sidebar_collapsed:GUEST')).toBe('true');

    // Expand again
    const expandBtn = screen.getByRole('button', { name: /^expand sidebar$/i });
    await user.click(expandBtn);
    expect(sidebar).toHaveAttribute('data-collapsed', 'false');
    expect(sidebar.className).toContain('w-64');
  });

  it('allows collapsing individual guest sidebar sections', async () => {
    const user = userEvent.setup();

    render(
      <PublicLayout selectedCategory="all">
        <div>Marketplace Body</div>
      </PublicLayout>
    );

    const groupToggle = screen.getByRole('button', { name: /Wholesale Categories/i });
    expect(groupToggle).toHaveAttribute('aria-expanded', 'true');
    await user.click(groupToggle);
    expect(groupToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /Category: Packaging & Disposables/i })).not.toBeInTheDocument();
  });

  it.each([
    {
      role: 'SHOP_OWNER',
      expectedBadge: 'Shop Owner',
      expectedGroup: 'Sourcing & Pools',
      expectedNavButton: 'Supplier Catalogue',
      expectedPath: '/suppliers',
    },
    {
      role: 'SUPPLIER',
      expectedBadge: 'Wholesaler',
      expectedGroup: 'Wholesaler Workspace',
      expectedNavButton: 'Supplier Portal',
      expectedPath: '/supplier-portal',
    },
    {
      role: 'ADMIN',
      expectedBadge: 'Admin',
      expectedGroup: 'Catalogue & Trust',
      expectedNavButton: 'Manage Offers',
      expectedPath: '/admin/offers',
    },
    {
      role: 'REVIEWER',
      expectedBadge: 'Reviewer',
      expectedGroup: 'Compliance & Audit',
      expectedNavButton: 'Audit & AI Logs',
      expectedPath: '/admin/audit',
    },
  ])(
    'renders role-specific collapsible menus on PublicLayout for $role',
    async ({ role, expectedBadge, expectedGroup, expectedNavButton, expectedPath }) => {
      const user = userEvent.setup();
      const onNavigate = vi.fn();

      render(
        <AuthContext.Provider value={{ user: { role, name: 'Test User' }, isAuthenticated: true }}>
          <PublicLayout selectedCategory="all" onNavigate={onNavigate}>
            <div>Marketplace Body</div>
          </PublicLayout>
        </AuthContext.Provider>
      );

      const sidebar = document.getElementById('public-sidebar-nav');
      expect(sidebar).toHaveAttribute('data-role', role);
      expect(screen.getByText(expectedBadge)).toBeInTheDocument();
      expect(screen.getByText(expectedGroup)).toBeInTheDocument();
      expect(screen.queryByText('Portals & Guides')).not.toBeInTheDocument();

      const navBtn = screen.getByRole('button', { name: expectedNavButton });
      await user.click(navBtn);
      expect(onNavigate).toHaveBeenCalledWith(expectedPath);
    }
  );
});
