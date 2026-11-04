/**
 * CoBuy AI — LoginPage (HIM-04)
 *
 * Features:
 *  - Dual Mode: Standard Password Authentication & Passwordless OTP Sign-in (Redis/BullMQ)
 *  - "Forgot Password?" navigation link & flow
 *  - 6 Demo Accounts panel (instant switch for evaluators)
 *  - Tabular layout, password visibility toggle, accessible alerts
 */

import React, { useState, useEffect } from 'react';
import { Link, useInRouterContext } from 'react-router-dom';
import { Eye, EyeOff, ShoppingBag, ArrowRight, Zap, KeyRound, Lock, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { toast } from '@/components/ui/Toast';
import { useAuth } from '@/context/AuthContext';

// ── Demo Accounts from Seeder (SAH-10) ─────────────────────────────────────────
const DEMO_ACCOUNTS = [
  {
    label: 'Shop A',
    name: 'Hazratganj Artisan Café',
    role: 'SHOP_OWNER',
    email: 'cafeA@demo.aapkidukan.in',
    password: 'SecurePassword123!',
    badge: 'success',
  },
  {
    label: 'Shop B',
    name: 'Gomti Bakery & Espresso',
    role: 'SHOP_OWNER',
    email: 'bakeryB@demo.aapkidukan.in',
    password: 'SecurePassword123!',
    badge: 'success',
  },
  {
    label: 'Shop C',
    name: 'Awadh Bistro & Roasters',
    role: 'SHOP_OWNER',
    email: 'bistroC@demo.aapkidukan.in',
    password: 'SecurePassword123!',
    badge: 'success',
  },
  {
    label: 'Wholesaler 1',
    name: 'Bharat EcoPack',
    role: 'SUPPLIER',
    email: 'supplier1@demo.aapkidukan.in',
    password: 'SecurePassword123!',
    badge: 'pool',
  },
  {
    label: 'Admin',
    name: 'Platform Admin',
    role: 'ADMIN',
    email: 'admin@demo.aapkidukan.in',
    password: 'SecurePassword123!',
    badge: 'warning',
  },
  {
    label: 'Reviewer',
    name: 'Read-Only Evaluator',
    role: 'REVIEWER',
    email: 'reviewer@demo.aapkidukan.in',
    password: 'SecurePassword123!',
    badge: 'neutral',
  },
];

const ROLE_LABELS = {
  SHOP_OWNER: 'Shop Owner',
  SUPPLIER: 'Wholesaler',
  ADMIN: 'Admin',
  REVIEWER: 'Reviewer',
};

function validateLoginForm({ email, password }) {
  const errors = {};
  if (!email.trim()) {
    errors.email = 'Email address is required.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    errors.email = 'Please enter a valid email address.';
  }
  if (!password) {
    errors.password = 'Password is required.';
  }
  return errors;
}

function BackToMarketplaceLink({ onNavigateToMarketplace }) {
  const inRouter = useInRouterContext();

  const handleClick = (e) => {
    if (typeof onNavigateToMarketplace === 'function') {
      e.preventDefault();
      onNavigateToMarketplace();
    } else if (!inRouter) {
      e.preventDefault();
    }
  };

  const linkClasses =
    'inline-flex items-center text-sm font-medium text-midnight-muted hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-midnight-red rounded';

  if (inRouter) {
    return (
      <Link to="/" onClick={handleClick} className={linkClasses}>
        ← Back to Marketplace
      </Link>
    );
  }

  return (
    <a href="/" onClick={handleClick} className={linkClasses}>
      ← Back to Marketplace
    </a>
  );
}

function ForgotPasswordLink({ onNavigateToForgotPassword }) {
  const inRouter = useInRouterContext();

  const handleClick = (e) => {
    if (typeof onNavigateToForgotPassword === 'function') {
      e.preventDefault();
      onNavigateToForgotPassword();
    } else if (!inRouter) {
      e.preventDefault();
    }
  };

  const linkClasses = "text-xs text-midnight-red hover:underline focus-visible:outline-none";

  if (inRouter) {
    return (
      <Link to="/forgot-password" onClick={handleClick} className={linkClasses}>
        Forgot password?
      </Link>
    );
  }

  return (
    <a href="/forgot-password" onClick={handleClick} className={linkClasses}>
      Forgot password?
    </a>
  );
}

export default function LoginPage({
  onNavigateToRegister,
  onLoginSuccess,
  onNavigateToMarketplace,
  onNavigateToForgotPassword,
}) {
  const { login, loginWithOtp, sendLoginOtp } = useAuth();

  // Mode: 'PASSWORD' or 'OTP'
  const [authMode, setAuthMode] = useState('PASSWORD');

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(null);

  // OTP Login state
  const [otpSent, setOtpSent] = useState(false);
  const [loginOtp, setLoginOtp] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    let timer;
    if (cooldown > 0) {
      timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [cooldown]);

  // ── Password Sign-in Submit ────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    setServerError('');

    const errors = validateLoginForm({ email, password });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    try {
      const result = await login({ email: email.trim(), password });
      if (result.success) {
        toast.success('Welcome back!', { description: `Signed in as ${result.user.name}` });
        if (typeof onLoginSuccess === 'function') {
          onLoginSuccess(result.user);
        }
      } else {
        setServerError(result.error || 'Login failed. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Send Login OTP ─────────────────────────────────────────────────────────
  async function handleSendLoginOtp(e) {
    e?.preventDefault();
    setServerError('');
    setFieldErrors({});

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setFieldErrors({ email: 'Please enter a valid email address.' });
      return;
    }

    setLoading(true);
    try {
      const result = await sendLoginOtp(cleanEmail);
      if (result.success) {
        setOtpSent(true);
        setCooldown(30);
        toast.success('Sign-in OTP dispatched!', {
          description: `Check your inbox (${cleanEmail}) or server logs`,
        });
      } else {
        setServerError(result.error || 'Failed to dispatch login OTP.');
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Resend Login OTP ───────────────────────────────────────────────────────
  async function handleResendLoginOtp() {
    if (cooldown > 0 || resending || !email.trim()) return;
    setResending(true);
    setServerError('');
    try {
      const result = await sendLoginOtp(email.trim().toLowerCase());
      if (result.success) {
        setCooldown(45);
        toast.success('Fresh OTP sent to your email!');
      } else {
        setServerError(result.error || 'Failed to resend code.');
      }
    } finally {
      setResending(false);
    }
  }

  // ── OTP Sign-in Submit ─────────────────────────────────────────────────────
  async function handleOtpSubmit(e) {
    e.preventDefault();
    setServerError('');

    if (!loginOtp.trim()) {
      setFieldErrors({ otp: 'Please enter the 6-digit OTP code.' });
      return;
    }

    setLoading(true);
    try {
      const result = await loginWithOtp({
        email: email.trim().toLowerCase(),
        otp: loginOtp.trim(),
      });

      if (result.success) {
        toast.success('Welcome back!', { description: `Signed in as ${result.user.name}` });
        if (typeof onLoginSuccess === 'function') {
          onLoginSuccess(result.user);
        }
      } else {
        setServerError(result.error || 'Invalid or expired OTP code.');
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Demo Sign-in ───────────────────────────────────────────────────────────
  async function handleDemoSignIn(account, index) {
    setServerError('');
    setFieldErrors({});
    setDemoLoading(index);
    try {
      const result = await login({ email: account.email, password: account.password });
      if (result.success) {
        toast.success(`Signed in as ${account.label}`, { description: account.name });
        if (typeof onLoginSuccess === 'function') {
          onLoginSuccess(result.user);
        }
      } else {
        setServerError(
          result.error ||
            'Demo account sign-in failed. Run the backend seeder (npm run seed) to populate demo accounts.'
        );
      }
    } finally {
      setDemoLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-midnight-bg flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">

        {/* ── Top Navigation Link ── */}
        <div>
          <BackToMarketplaceLink onNavigateToMarketplace={onNavigateToMarketplace} />
        </div>

        {/* ── Branding header ── */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-4">
            <ShoppingBag className="h-8 w-8 text-midnight-red" aria-hidden="true" />
            <span className="text-2xl font-bold text-midnight-text font-space-grotesk tracking-tight">
              CoBuy AI
            </span>
          </div>
          <h1 className="text-3xl font-bold text-midnight-text">Sign in</h1>
          <p className="text-midnight-muted text-sm">
            Access your group-buying workspace.
          </p>
        </div>

        {/* ── Login Form Card ── */}
        <div className="bg-midnight-card border border-midnight-border rounded-xl p-8 shadow-lg shadow-black/40 space-y-5">

          {/* ── Auth Mode Selector Tabs ── */}
          <div className="flex border-b border-midnight-border/60 pb-3 gap-2">
            <button
              type="button"
              onClick={() => { setAuthMode('PASSWORD'); setServerError(''); }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                authMode === 'PASSWORD'
                  ? 'bg-midnight-surface text-white border border-midnight-border shadow-xs'
                  : 'text-midnight-muted hover:text-white'
              }`}
            >
              Password Sign-In
            </button>
            <button
              type="button"
              onClick={() => { setAuthMode('OTP'); setServerError(''); }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                authMode === 'OTP'
                  ? 'bg-midnight-surface text-white border border-midnight-border shadow-xs'
                  : 'text-midnight-muted hover:text-white'
              }`}
            >
              Sign in with OTP ⚡
            </button>
          </div>

          {serverError && (
            <Alert variant="error" role="alert">
              <p className="text-sm">{serverError}</p>
            </Alert>
          )}

          {/* ── MODE 1: Standard Password Sign-in ── */}
          {authMode === 'PASSWORD' && (
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <Input
                id="login-email"
                type="email"
                label="Email address"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setFieldErrors((p) => ({ ...p, email: '' })); }}
                error={fieldErrors.email}
                autoComplete="username"
                disabled={loading || demoLoading !== null}
                aria-required="true"
              />

              <div className="space-y-1">
                <div className="relative">
                  <Input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    label="Password"
                    placeholder="Your password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setFieldErrors((p) => ({ ...p, password: '' })); }}
                    error={fieldErrors.password}
                    autoComplete="current-password"
                    disabled={loading || demoLoading !== null}
                    aria-required="true"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-8 text-midnight-muted hover:text-midnight-text transition-colors"
                    tabIndex={0}
                  >
                    {showPassword
                      ? <EyeOff className="h-4 w-4" aria-hidden="true" />
                      : <Eye className="h-4 w-4" aria-hidden="true" />
                    }
                  </button>
                </div>

                <div className="flex justify-end pt-1">
                  <ForgotPasswordLink onNavigateToForgotPassword={onNavigateToForgotPassword} />
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full mt-2"
                loading={loading}
                disabled={loading || demoLoading !== null}
                aria-label="Sign in to your account"
              >
                {loading ? 'Signing in…' : 'Sign in'}
                {!loading && <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />}
              </Button>
            </form>
          )}

          {/* ── MODE 2: Passwordless OTP Sign-in ── */}
          {authMode === 'OTP' && (
            <div className="space-y-4">
              {!otpSent ? (
                <form onSubmit={handleSendLoginOtp} className="space-y-4">
                  <Input
                    id="otp-login-email"
                    type="email"
                    label="Registered email address"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setFieldErrors((p) => ({ ...p, email: '' })); }}
                    error={fieldErrors.email}
                    autoComplete="email"
                    disabled={loading}
                    required
                    autoFocus
                  />
                  <p className="text-xs text-midnight-muted">
                    We will send a 6-digit one-time code to your registered email address.
                  </p>
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    className="w-full"
                    loading={loading}
                  >
                    Send 6-Digit Login Code
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleOtpSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="block text-xs font-semibold text-midnight-text">
                        Enter 6-Digit OTP Code
                      </label>
                      <button
                        type="button"
                        onClick={handleResendLoginOtp}
                        disabled={cooldown > 0 || resending}
                        className="text-xs text-midnight-red hover:underline disabled:opacity-50"
                      >
                        {resending ? 'Sending...' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend Code'}
                      </button>
                    </div>
                    <Input
                      id="otp-login-code"
                      type="text"
                      maxLength={6}
                      value={loginOtp}
                      onChange={(e) => {
                        setLoginOtp(e.target.value.replace(/\D/g, ''));
                        setFieldErrors((p) => ({ ...p, otp: '' }));
                      }}
                      error={fieldErrors.otp}
                      placeholder="123456"
                      className="text-center font-mono tracking-widest text-lg"
                      autoFocus
                      required
                    />
                    <p className="text-[11px] text-midnight-muted">
                      Code sent to <span className="text-white font-medium">{email}</span>. (Demo code: <code className="text-white font-mono">123456</code>).
                    </p>
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    className="w-full"
                    loading={loading}
                  >
                    Verify & Launch Workspace
                  </Button>

                  <button
                    type="button"
                    onClick={() => { setOtpSent(false); setLoginOtp(''); }}
                    className="w-full text-center text-xs text-midnight-muted hover:text-white pt-1"
                  >
                    ← Use a different email
                  </button>
                </form>
              )}
            </div>
          )}

          {/* ── Register link ── */}
          <p className="text-center text-sm text-midnight-muted pt-2 border-t border-midnight-border/40">
            Don&apos;t have an account?{' '}
            <button
              type="button"
              onClick={onNavigateToRegister}
              className="text-midnight-red hover:text-red-400 font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-midnight-red rounded"
              aria-label="Go to registration page"
            >
              Register your business
            </button>
          </p>
        </div>

        {/* ── Quick Demo Sign-In Panel ── */}
        <div className="bg-midnight-card border border-midnight-border rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-midnight-gold" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-midnight-text">Quick Demo Sign-In</h2>
            <Badge variant="warning" className="ml-auto text-[10px]">DEMO ONLY</Badge>
          </div>
          <p className="text-xs text-midnight-muted leading-relaxed">
            These accounts authenticate through the real backend.{' '}
            Requires the demo seeder to be executed (<code className="text-midnight-red">npm run seed</code>).
          </p>
          <div className="grid grid-cols-2 gap-2" role="list" aria-label="Demo accounts">
            {DEMO_ACCOUNTS.map((account, index) => (
              <button
                key={account.email}
                type="button"
                disabled={loading || demoLoading !== null}
                onClick={() => handleDemoSignIn(account, index)}
                aria-label={`Sign in as ${account.label} — ${account.name}`}
                className="relative flex flex-col gap-0.5 rounded-lg border border-midnight-border bg-midnight-surface p-3 text-left text-xs hover:border-slate-500 hover:bg-midnight-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-midnight-red transition-colors disabled:opacity-50 disabled:pointer-events-none"
              >
                {demoLoading === index && (
                  <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-midnight-surface/80">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-midnight-red border-t-transparent" aria-label="Loading" />
                  </span>
                )}
                <span className="font-semibold text-midnight-text">{account.label}</span>
                <span className="text-midnight-muted truncate">{account.name}</span>
                <Badge variant={account.badge} className="mt-1 w-fit text-[10px]">
                  {ROLE_LABELS[account.role]}
                </Badge>
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
