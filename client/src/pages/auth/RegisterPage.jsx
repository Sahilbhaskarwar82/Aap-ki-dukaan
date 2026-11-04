/**
 * CoBuy AI — RegisterPage (HIM-04)
 *
 * Features:
 *  - Step 1: Business Registration Form
 *    - Name, email, password, confirm-password fields
 *    - Role selection: SHOP_OWNER or SUPPLIER only
 *    - SHOP_OWNER requires shop details (name, business type, delivery area, city, state, postal code)
 *    - Live client-side & backend validation
 *  - Step 2: Instant Email OTP Verification Screen
 *    - Dispatches 6-digit verification code via Upstash Redis queue & Resend
 *    - Direct auto-login on OTP entry — user goes straight to their dashboard
 *    - No duplicate sign-in step needed!
 */

import React, { useState, useEffect } from 'react';
import { Link, useInRouterContext } from 'react-router-dom';
import { Eye, EyeOff, ShoppingBag, ArrowRight, KeyRound, CheckCircle2, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { toast } from '@/components/ui/Toast';
import { useAuth } from '@/context/AuthContext';

// ── Constants ──────────────────────────────────────────────────────────────────
const BUSINESS_TYPES = [
  { value: 'KIRANA_RETAIL',   label: 'Kirana / General Store' },
  { value: 'CAFE_RESTAURANT', label: 'Café / Restaurant' },
  { value: 'BAKERY',          label: 'Bakery' },
  { value: 'PHARMACY',        label: 'Pharmacy' },
  { value: 'GROCERY',         label: 'Grocery / Supermarket' },
  { value: 'WHOLESALE',       label: 'Wholesale Supplier' },
  { value: 'OTHER',           label: 'Other' },
];

// ── Validation ────────────────────────────────────────────────────────────────
function validateForm(fields) {
  const errors = {};

  if (!fields.name.trim()) errors.name = 'Full name is required.';

  if (!fields.email.trim()) {
    errors.email = 'Email address is required.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim())) {
    errors.email = 'Please enter a valid email address.';
  }

  if (!fields.password) {
    errors.password = 'Password is required.';
  } else if (fields.password.length < 8) {
    errors.password = 'Password must be at least 8 characters.';
  }

  if (!fields.confirmPassword) {
    errors.confirmPassword = 'Please confirm your password.';
  } else if (fields.password !== fields.confirmPassword) {
    errors.confirmPassword = 'Passwords do not match.';
  }

  if (!fields.role) errors.role = 'Please select your account role.';

  if (fields.role === 'SHOP_OWNER') {
    if (!fields.shopName.trim()) errors.shopName = 'Business name is required.';
    if (!fields.deliveryArea.trim()) errors.deliveryArea = 'Delivery area is required.';
    if (!fields.city.trim()) errors.city = 'City is required.';
    if (!fields.state.trim()) errors.state = 'State is required.';
    if (!fields.postalCode.trim()) errors.postalCode = 'Postal code is required.';
  }

  return errors;
}

// ── Back to Marketplace Link ──────────────────────────────────────────────────
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

// ── Component ─────────────────────────────────────────────────────────────────
export default function RegisterPage({
  onNavigateToLogin,
  onRegisterSuccess,
  onNavigateToMarketplace,
}) {
  const { register, verifyOtp, resendOtp } = useAuth();

  const [fields, setFields] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'SHOP_OWNER',
    shopName: '',
    businessType: 'KIRANA_RETAIL',
    deliveryArea: '',
    city: '',
    state: '',
    postalCode: '',
  });

  const [showPassword, setShowPassword]               = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [fieldErrors, setFieldErrors]                 = useState({});
  const [serverErrors, setServerErrors]               = useState([]);
  const [loading, setLoading]                         = useState(false);

  // OTP Verification Step State
  const [awaitingOtp, setAwaitingOtp]                 = useState(false);
  const [otpCode, setOtpCode]                         = useState('');
  const [otpLoading, setOtpLoading]                   = useState(false);
  const [otpError, setOtpError]                       = useState('');
  const [cooldown, setCooldown]                       = useState(0);
  const [resending, setResending]                     = useState(false);
  const [registeredUser, setRegisteredUser]           = useState(null);

  useEffect(() => {
    let timer;
    if (cooldown > 0) {
      timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [cooldown]);

  function setField(key, value) {
    setFields((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: '' }));
  }

  // ── Step 1: Submit Registration ─────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    setServerErrors([]);

    const errors = validateForm(fields);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const payload = {
      name: fields.name.trim(),
      email: fields.email.trim(),
      password: fields.password,
      role: fields.role,
    };

    if (fields.role === 'SHOP_OWNER') {
      payload.shopDetails = {
        name: fields.shopName.trim(),
        businessType: fields.businessType || 'KIRANA_RETAIL',
        deliveryArea: fields.deliveryArea.trim(),
        deliveryAddress: {
          street: '',
          city: fields.city.trim(),
          state: fields.state.trim(),
          postalCode: fields.postalCode.trim(),
          country: 'IN',
        },
      };
    }

    setLoading(true);
    try {
      const result = await register(payload);
      if (result.success) {
        setRegisteredUser(result.user);
        setAwaitingOtp(true);
        setCooldown(30);
        toast.success('Registration successful!', {
          description: `6-digit verification code sent to ${fields.email}`,
        });
      } else {
        const messages = [];
        if (result.error) messages.push(result.error);
        if (Array.isArray(result.errors)) {
          result.errors.forEach((e) => {
            if (e && e !== result.error && !messages.includes(e)) {
              messages.push(e);
            }
          });
        }
        setServerErrors(messages.length > 0 ? messages : ['Registration failed.']);
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: Verify OTP and Immediately Log In to Dashboard ──────────────────
  async function handleVerifyOtpSubmit(e) {
    e.preventDefault();
    setOtpError('');

    if (!otpCode.trim()) {
      setOtpError('Please enter the 6-digit OTP code.');
      return;
    }

    setOtpLoading(true);
    try {
      const result = await verifyOtp({
        email: fields.email.trim().toLowerCase(),
        otp: otpCode.trim(),
      });

      if (result.success) {
        toast.success('Email verified successfully!', {
          description: `Welcome to CoBuy AI, ${result.user?.name || fields.name}`,
        });
        if (typeof onRegisterSuccess === 'function') {
          onRegisterSuccess(result.user || registeredUser);
        }
      } else {
        setOtpError(result.error || 'Invalid or expired OTP code.');
      }
    } finally {
      setOtpLoading(false);
    }
  }

  // ── Resend Verification Code ────────────────────────────────────────────────
  async function handleResendCode() {
    if (cooldown > 0 || resending || !fields.email) return;
    setResending(true);
    setOtpError('');
    try {
      const result = await resendOtp(fields.email.trim().toLowerCase());
      if (result.success) {
        setCooldown(45);
        toast.success('Fresh verification code sent!');
      } else {
        setOtpError(result.error || 'Failed to resend code.');
      }
    } finally {
      setResending(false);
    }
  }

  // ── Direct Proceed / Skip to Dashboard ──────────────────────────────────────
  function handleSkipToDashboard() {
    if (typeof onRegisterSuccess === 'function' && registeredUser) {
      onRegisterSuccess(registeredUser);
    } else if (typeof onNavigateToLogin === 'function') {
      onNavigateToLogin();
    }
  }

  // ── STEP 2 RENDER: Interactive OTP Screen ───────────────────────────────────
  if (awaitingOtp) {
    return (
      <div className="min-h-screen bg-midnight-bg flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mx-auto mb-2">
              <KeyRound className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Verify Your Email</h1>
            <p className="text-sm text-midnight-muted">
              We dispatched a 6-digit code to{' '}
              <span className="text-white font-medium">{fields.email}</span>
            </p>
          </div>

          <div className="bg-midnight-card border border-midnight-border rounded-xl p-8 shadow-2xl space-y-5">
            {otpError && (
              <Alert variant="error" onDismiss={() => setOtpError('')}>
                {otpError}
              </Alert>
            )}

            <form onSubmit={handleVerifyOtpSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-midnight-muted">
                    6-Digit Verification Code
                  </label>
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={cooldown > 0 || resending}
                    className="text-xs text-midnight-red hover:underline disabled:opacity-50"
                  >
                    {resending ? 'Sending...' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend Code'}
                  </button>
                </div>
                <Input
                  id="reg-otp-input"
                  type="text"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => {
                    setOtpCode(e.target.value.replace(/\D/g, ''));
                    setOtpError('');
                  }}
                  placeholder="123456"
                  className="text-center font-mono tracking-widest text-xl py-3"
                  autoFocus
                  required
                />
                <p className="text-[11px] text-midnight-muted">
                  Tip: Demo code <code className="text-white font-mono">123456</code> or check your email inbox.
                </p>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
                loading={otpLoading}
              >
                Verify & Launch Dashboard
                {!otpLoading && <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />}
              </Button>

              <button
                type="button"
                onClick={handleSkipToDashboard}
                className="w-full text-center text-xs text-midnight-muted hover:text-white pt-2 underline underline-offset-2"
              >
                Continue directly to Workspace →
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ── STEP 1 RENDER: Business Registration Form ───────────────────────────────
  return (
    <div className="min-h-screen bg-midnight-bg flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl space-y-6">

        {/* ── Top Navigation Link ── */}
        <div>
          <BackToMarketplaceLink onNavigateToMarketplace={onNavigateToMarketplace} />
        </div>

        {/* ── Header ── */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-4">
            <ShoppingBag className="h-7 w-7 text-midnight-red" aria-hidden="true" />
            <span className="text-xl font-bold text-midnight-text font-space-grotesk">CoBuy AI</span>
          </div>
          <h1 className="text-3xl font-bold text-midnight-text">Register your business</h1>
          <p className="text-midnight-muted text-sm">
            Join the collective-buying platform for kiranas, cafés, and wholesalers.
          </p>
        </div>

        <div className="bg-midnight-card border border-midnight-border rounded-xl p-8 shadow-lg shadow-black/40 space-y-5">

          {serverErrors.length > 0 && (
            <Alert variant="error" role="alert">
              <ul className="text-sm space-y-1 list-disc list-inside">
                {serverErrors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </Alert>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">

            {/* Personal info */}
            <fieldset className="space-y-4">
              <legend className="text-xs font-semibold uppercase tracking-wide text-midnight-muted mb-2">
                Personal Details
              </legend>
              <Input
                id="reg-name"
                label="Full name"
                placeholder="Your full name"
                value={fields.name}
                onChange={(e) => setField('name', e.target.value)}
                error={fieldErrors.name}
                autoComplete="name"
                disabled={loading}
                aria-required="true"
              />
              <Input
                id="reg-email"
                type="email"
                label="Email address"
                placeholder="you@business.com"
                value={fields.email}
                onChange={(e) => setField('email', e.target.value)}
                error={fieldErrors.email}
                autoComplete="email"
                disabled={loading}
                aria-required="true"
              />

              {/* Password */}
              <div className="relative">
                <Input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  label="Password"
                  placeholder="Minimum 8 characters"
                  value={fields.password}
                  onChange={(e) => setField('password', e.target.value)}
                  error={fieldErrors.password}
                  autoComplete="new-password"
                  disabled={loading}
                  aria-required="true"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-8 text-midnight-muted hover:text-midnight-text transition-colors"
                >
                  {showPassword
                    ? <EyeOff className="h-4 w-4" aria-hidden="true" />
                    : <Eye className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>

              {/* Confirm password */}
              <div className="relative">
                <Input
                  id="reg-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  label="Confirm password"
                  placeholder="Re-enter your password"
                  value={fields.confirmPassword}
                  onChange={(e) => setField('confirmPassword', e.target.value)}
                  error={fieldErrors.confirmPassword}
                  autoComplete="new-password"
                  disabled={loading}
                  aria-required="true"
                />
                <button
                  type="button"
                  aria-label={showConfirmPassword ? 'Hide confirm-password' : 'Show confirm-password'}
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute right-3 top-8 text-midnight-muted hover:text-midnight-text transition-colors"
                >
                  {showConfirmPassword
                    ? <EyeOff className="h-4 w-4" aria-hidden="true" />
                    : <Eye className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>
            </fieldset>

            {/* Role selection */}
            <Select
              id="reg-role"
              label="Account type"
              value={fields.role}
              onChange={(e) => setField('role', e.target.value)}
              error={fieldErrors.role}
              disabled={loading}
              aria-required="true"
              options={[
                { value: 'SHOP_OWNER', label: 'Shop Owner (Retailer / Kirana)' },
                { value: 'SUPPLIER',   label: 'Wholesaler / Supplier' },
              ]}
            />

            {/* Shop details — shown only for SHOP_OWNER */}
            {fields.role === 'SHOP_OWNER' && (
              <fieldset className="space-y-4 border border-midnight-border rounded-lg p-4">
                <legend className="text-xs font-semibold uppercase tracking-wide text-midnight-muted px-1">
                  Shop / Business Details
                </legend>

                <Input
                  id="reg-shop-name"
                  label="Business name"
                  placeholder="e.g. Hazratganj Artisan Café"
                  value={fields.shopName}
                  onChange={(e) => setField('shopName', e.target.value)}
                  error={fieldErrors.shopName}
                  disabled={loading}
                  aria-required="true"
                />

                <Select
                  id="reg-business-type"
                  label="Business type"
                  value={fields.businessType}
                  onChange={(e) => setField('businessType', e.target.value)}
                  disabled={loading}
                  options={BUSINESS_TYPES}
                />

                <Input
                  id="reg-delivery-area"
                  label="Delivery area"
                  placeholder="e.g. Hazratganj, Lucknow"
                  value={fields.deliveryArea}
                  onChange={(e) => setField('deliveryArea', e.target.value)}
                  error={fieldErrors.deliveryArea}
                  disabled={loading}
                  aria-required="true"
                />

                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-1">
                    <Input
                      id="reg-city"
                      label="City"
                      placeholder="Lucknow"
                      value={fields.city}
                      onChange={(e) => setField('city', e.target.value)}
                      error={fieldErrors.city}
                      disabled={loading}
                      aria-required="true"
                    />
                  </div>
                  <div className="col-span-1">
                    <Input
                      id="reg-state"
                      label="State"
                      placeholder="UP"
                      value={fields.state}
                      onChange={(e) => setField('state', e.target.value)}
                      error={fieldErrors.state}
                      disabled={loading}
                      aria-required="true"
                    />
                  </div>
                  <div className="col-span-1">
                    <Input
                      id="reg-postal"
                      label="PIN code"
                      placeholder="226001"
                      value={fields.postalCode}
                      onChange={(e) => setField('postalCode', e.target.value)}
                      error={fieldErrors.postalCode}
                      disabled={loading}
                      aria-required="true"
                    />
                  </div>
                </div>
              </fieldset>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              loading={loading}
              disabled={loading}
              aria-label="Create your account"
            >
              {loading ? 'Creating account…' : 'Register & Send Verification Code'}
              {!loading && <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />}
            </Button>
          </form>

          <p className="text-center text-sm text-midnight-muted">
            Already have an account?{' '}
            <button
              type="button"
              onClick={onNavigateToLogin}
              className="text-midnight-red hover:text-red-400 font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-midnight-red rounded"
              aria-label="Go to login page"
            >
              Sign in
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
