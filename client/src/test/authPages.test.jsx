/**
 * HIM-04 Tests — LoginPage and RegisterPage
 *
 * Tests cover:
 *  - Valid login / invalid login / empty fields / invalid email
 *  - Password mismatch on registration
 *  - Registration success / duplicate email error
 *  - Backend validation errors display
 *  - Loading state
 *  - Demo-account selection calls login
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// Mock AuthContext so pages don't need the full provider tree
vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '@/context/AuthContext';
import LoginPage from '@/pages/auth/LoginPage';
import RegisterPage from '@/pages/auth/RegisterPage';

// ── Helpers ───────────────────────────────────────────────────────────────────
function setupAuth({ login = vi.fn(), register = vi.fn() } = {}) {
  useAuth.mockReturnValue({ login, register });
  return { login, register };
}

const onNavigateToRegister = vi.fn();
const onNavigateToLogin    = vi.fn();
const onLoginSuccess       = vi.fn();
const onRegisterSuccess    = vi.fn();

// ── LoginPage tests ───────────────────────────────────────────────────────────
describe('HIM-04: LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders visible "← Back to Marketplace" link pointing to "/"', () => {
    setupAuth();
    render(
      <MemoryRouter>
        <LoginPage onNavigateToRegister={onNavigateToRegister} />
      </MemoryRouter>
    );
    const link = screen.getByRole('link', { name: /Back to Marketplace/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveTextContent('← Back to Marketplace');
    expect(link).toHaveAttribute('href', '/');
  });

  it('calls onNavigateToMarketplace callback when "← Back to Marketplace" is clicked', async () => {
    const onNavigateToMarketplace = vi.fn();
    setupAuth();
    render(
      <LoginPage
        onNavigateToRegister={onNavigateToRegister}
        onNavigateToMarketplace={onNavigateToMarketplace}
      />
    );
    const link = screen.getByRole('link', { name: /Back to Marketplace/i });
    await userEvent.click(link);
    expect(onNavigateToMarketplace).toHaveBeenCalledTimes(1);
  });

  it('renders email field, password field, and sign-in button', () => {
    setupAuth();
    render(<LoginPage onNavigateToRegister={onNavigateToRegister} />);
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in to your account/i })).toBeInTheDocument();
  });

  it('shows email validation error when email is empty', async () => {
    setupAuth();
    render(<LoginPage onNavigateToRegister={onNavigateToRegister} />);
    await userEvent.click(screen.getByRole('button', { name: /sign in to your account/i }));
    expect(await screen.findByText(/email address is required/i)).toBeInTheDocument();
  });

  it('shows error when email format is invalid', async () => {
    setupAuth();
    render(<LoginPage onNavigateToRegister={onNavigateToRegister} />);
    await userEvent.type(screen.getByLabelText(/email address/i), 'not-an-email');
    await userEvent.click(screen.getByRole('button', { name: /sign in to your account/i }));
    expect(await screen.findByText(/valid email address/i)).toBeInTheDocument();
  });

  it('shows password required error when password is empty', async () => {
    setupAuth();
    render(<LoginPage onNavigateToRegister={onNavigateToRegister} />);
    await userEvent.type(screen.getByLabelText(/email address/i), 'test@test.com');
    await userEvent.click(screen.getByRole('button', { name: /sign in to your account/i }));
    expect(await screen.findByText(/password is required/i)).toBeInTheDocument();
  });

  it('calls login with correct credentials on valid submit', async () => {
    const { login } = setupAuth({
      login: vi.fn().mockResolvedValue({ success: true, user: { name: 'Test', role: 'SHOP_OWNER' } }),
    });
    render(<LoginPage onNavigateToRegister={onNavigateToRegister} onLoginSuccess={onLoginSuccess} />);

    await userEvent.type(screen.getByLabelText(/email address/i), 'test@example.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'Password123!');
    await userEvent.click(screen.getByRole('button', { name: /sign in to your account/i }));

    await waitFor(() => expect(login).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'Password123!',
    }));
  });

  it('displays backend error message on failed login', async () => {
    setupAuth({
      login: vi.fn().mockResolvedValue({
        success: false,
        error: 'Invalid email or password.',
        errors: ['INVALID_CREDENTIALS'],
      }),
    });
    render(<LoginPage onNavigateToRegister={onNavigateToRegister} />);

    await userEvent.type(screen.getByLabelText(/email address/i), 'bad@email.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'wrongpass');
    await userEvent.click(screen.getByRole('button', { name: /sign in to your account/i }));

    expect(await screen.findByText(/invalid email or password/i)).toBeInTheDocument();
  });

  it('shows loading state during form submission', async () => {
    let resolve;
    const pendingLogin = vi.fn().mockReturnValue(new Promise((r) => (resolve = r)));
    setupAuth({ login: pendingLogin });

    render(<LoginPage onNavigateToRegister={onNavigateToRegister} />);
    await userEvent.type(screen.getByLabelText(/email address/i), 'test@example.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'Password123!');

    const submitBtn = screen.getByRole('button', { name: /sign in to your account/i });
    await userEvent.click(submitBtn);

    await waitFor(() => expect(submitBtn).toBeDisabled());

    await act(async () => resolve({ success: false, error: 'Failed.' }));
  });

  it('renders demo accounts panel with 6 demo buttons', () => {
    setupAuth();
    render(<LoginPage onNavigateToRegister={onNavigateToRegister} />);
    const list = screen.getByRole('list', { name: /demo accounts/i });
    // demo buttons are rendered inside the list container
    const demoButtons = list.querySelectorAll('button');
    expect(demoButtons.length).toBe(6);
  });

  it('clicking a demo account calls login with demo credentials', async () => {
    const { login } = setupAuth({
      login: vi.fn().mockResolvedValue({ success: true, user: { name: 'Hazratganj Artisan Café', role: 'SHOP_OWNER' } }),
    });
    render(<LoginPage onNavigateToRegister={onNavigateToRegister} onLoginSuccess={onLoginSuccess} />);

    // Find by partial aria-label match on the button element directly
    const shopABtn = screen.getByRole('button', { name: (name) => name.startsWith('Sign in as Shop A') });
    await userEvent.click(shopABtn);

    await waitFor(() => expect(login).toHaveBeenCalledWith({
      email: 'cafeA@demo.aapkidukan.in',
      password: 'SecurePassword123!',
    }));
  });

  it('toggles password visibility', async () => {
    setupAuth();
    render(<LoginPage onNavigateToRegister={onNavigateToRegister} />);
    const passwordInput = screen.getByLabelText(/^password$/i);
    expect(passwordInput).toHaveAttribute('type', 'password');

    await userEvent.click(screen.getByLabelText(/show password/i));
    expect(passwordInput).toHaveAttribute('type', 'text');

    await userEvent.click(screen.getByLabelText(/hide password/i));
    expect(passwordInput).toHaveAttribute('type', 'password');
  });
});

// ── RegisterPage tests ────────────────────────────────────────────────────────
describe('HIM-04: RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders visible "← Back to Marketplace" link pointing to "/"', () => {
    setupAuth();
    render(
      <MemoryRouter>
        <RegisterPage onNavigateToLogin={onNavigateToLogin} />
      </MemoryRouter>
    );
    const link = screen.getByRole('link', { name: /Back to Marketplace/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveTextContent('← Back to Marketplace');
    expect(link).toHaveAttribute('href', '/');
  });

  it('calls onNavigateToMarketplace callback when "← Back to Marketplace" is clicked', async () => {
    const onNavigateToMarketplace = vi.fn();
    setupAuth();
    render(
      <RegisterPage
        onNavigateToLogin={onNavigateToLogin}
        onNavigateToMarketplace={onNavigateToMarketplace}
      />
    );
    const link = screen.getByRole('link', { name: /Back to Marketplace/i });
    await userEvent.click(link);
    expect(onNavigateToMarketplace).toHaveBeenCalledTimes(1);
  });

  it('renders core fields: name, email, password, confirm password, role', () => {
    setupAuth();
    render(<RegisterPage onNavigateToLogin={onNavigateToLogin} />);
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    // Use id-based query to avoid ambiguity with toggle button aria-labels
    expect(document.querySelector('#reg-password')).toBeInTheDocument();
    expect(document.querySelector('#reg-confirm-password')).toBeInTheDocument();
    expect(screen.getByLabelText(/account type/i)).toBeInTheDocument();
  });

  it('shows validation error when passwords do not match', async () => {
    setupAuth();
    render(<RegisterPage onNavigateToLogin={onNavigateToLogin} />);

    await userEvent.type(screen.getByLabelText(/full name/i), 'Test User');
    await userEvent.type(screen.getByLabelText(/email address/i), 'test@example.com');
    await userEvent.type(document.querySelector('#reg-password'), 'Password123!');
    await userEvent.type(document.querySelector('#reg-confirm-password'), 'Different456!');
    await userEvent.click(screen.getByRole('button', { name: /create your account/i }));

    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
  });

  it('shows shop details fields when role is SHOP_OWNER', () => {
    setupAuth();
    render(<RegisterPage onNavigateToLogin={onNavigateToLogin} />);
    // Default role is SHOP_OWNER — shop details section should be visible
    expect(screen.getByLabelText(/business name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/delivery area/i)).toBeInTheDocument();
  });

  it('hides shop details when SUPPLIER role is selected', async () => {
    setupAuth();
    render(<RegisterPage onNavigateToLogin={onNavigateToLogin} />);
    const roleSelect = screen.getByLabelText(/account type/i);
    await userEvent.selectOptions(roleSelect, 'SUPPLIER');
    expect(screen.queryByLabelText(/business name/i)).not.toBeInTheDocument();
  });

  it('calls register with correct payload for SHOP_OWNER', async () => {
    const { register } = setupAuth({
      register: vi.fn().mockResolvedValue({
        success: true,
        user: { name: 'Test Shop', role: 'SHOP_OWNER' },
        shop: { name: 'My Shop' },
        token: 'jwt-xyz',
      }),
    });

    render(<RegisterPage onNavigateToLogin={onNavigateToLogin} onRegisterSuccess={onRegisterSuccess} />);

    await userEvent.type(screen.getByLabelText(/full name/i), 'Test User');
    await userEvent.type(screen.getByLabelText(/email address/i), 'test@example.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'Password123!');
    await userEvent.type(document.querySelector('#reg-confirm-password'), 'Password123!');
    await userEvent.type(screen.getByLabelText(/business name/i), 'My Shop');
    await userEvent.type(screen.getByLabelText(/delivery area/i), 'Hazratganj, Lucknow');
    await userEvent.type(screen.getByLabelText(/city/i), 'Lucknow');
    await userEvent.type(screen.getByLabelText(/state/i), 'UP');
    await userEvent.type(screen.getByLabelText(/pin code/i), '226001');

    await userEvent.click(screen.getByRole('button', { name: /create your account/i }));

    await waitFor(() => expect(register).toHaveBeenCalled());
    const callArg = register.mock.calls[0][0];
    expect(callArg.name).toBe('Test User');
    expect(callArg.email).toBe('test@example.com');
    expect(callArg.role).toBe('SHOP_OWNER');
    expect(callArg.shopDetails.name).toBe('My Shop');
    expect(callArg.shopDetails.deliveryAddress.city).toBe('Lucknow');
    // Password must not persist after submit
    expect(callArg).not.toHaveProperty('confirmPassword');
  });

  it('displays duplicate email error from backend', async () => {
    setupAuth({
      register: vi.fn().mockResolvedValue({
        success: false,
        error: 'An account with this email address already exists.',
        errors: ['DUPLICATE_EMAIL'],
      }),
    });

    render(<RegisterPage onNavigateToLogin={onNavigateToLogin} />);
    await userEvent.type(screen.getByLabelText(/full name/i), 'Test');
    await userEvent.type(screen.getByLabelText(/email address/i), 'dupe@example.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'Password123!');
    await userEvent.type(document.querySelector('#reg-confirm-password'), 'Password123!');
    await userEvent.type(screen.getByLabelText(/business name/i), 'Shop');
    await userEvent.type(screen.getByLabelText(/delivery area/i), 'Area');
    await userEvent.type(screen.getByLabelText(/city/i), 'City');
    await userEvent.type(screen.getByLabelText(/state/i), 'ST');
    await userEvent.type(screen.getByLabelText(/pin code/i), '123456');

    await userEvent.click(screen.getByRole('button', { name: /create your account/i }));

    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
  });

  it('does not allow ADMIN or REVIEWER role selection', () => {
    setupAuth();
    render(<RegisterPage onNavigateToLogin={onNavigateToLogin} />);
    const roleSelect = screen.getByLabelText(/account type/i);
    const options = Array.from(roleSelect.querySelectorAll('option')).map((o) => o.value);
    expect(options).not.toContain('ADMIN');
    expect(options).not.toContain('REVIEWER');
  });

  it('shows loading state during registration', async () => {
    let resolve;
    setupAuth({
      register: vi.fn().mockReturnValue(new Promise((r) => (resolve = r))),
    });

    render(<RegisterPage onNavigateToLogin={onNavigateToLogin} />);
    await userEvent.type(screen.getByLabelText(/full name/i), 'Test');
    await userEvent.type(screen.getByLabelText(/email address/i), 'test@example.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'Password123!');
    await userEvent.type(document.querySelector('#reg-confirm-password'), 'Password123!');
    await userEvent.type(screen.getByLabelText(/business name/i), 'Shop');
    await userEvent.type(screen.getByLabelText(/delivery area/i), 'Area');
    await userEvent.type(screen.getByLabelText(/city/i), 'City');
    await userEvent.type(screen.getByLabelText(/state/i), 'ST');
    await userEvent.type(screen.getByLabelText(/pin code/i), '123456');

    const submitBtn = screen.getByRole('button', { name: /create your account/i });
    await userEvent.click(submitBtn);

    await waitFor(() => expect(submitBtn).toBeDisabled());

    await act(async () => resolve({ success: false, error: 'Error' }));
  });
});
