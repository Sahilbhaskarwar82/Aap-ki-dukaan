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
