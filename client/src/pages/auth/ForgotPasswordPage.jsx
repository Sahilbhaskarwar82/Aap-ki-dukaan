/**
 * CoBuy AI — ForgotPasswordPage
 *
 * Implements 2-step password reset flow via 6-digit Redis/Resend OTP:
 *  Step 1: Enter email -> Request 6-digit reset OTP
 *  Step 2: Enter 6-digit OTP + New Password -> Reset password
 */

import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound, Lock, ArrowLeft, ArrowRight, CheckCircle2, RotateCw, ShoppingBag } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { toast } from '@/components/ui/Toast';

export default function ForgotPasswordPage({ onNavigateToLogin }) {
  const { forgotPassword, resetPassword, login } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1); // 1 = Enter Email, 2 = Enter OTP & New Password
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Countdown timer for resend
  useEffect(() => {
    let timer;
    if (cooldown > 0) {
      timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Step 1: Send reset OTP
  async function handleSendOtp(e) {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Please enter a valid registered email address.');
      return;
    }

    setLoading(true);
    try {
      const result = await forgotPassword(cleanEmail);
      if (result.success) {
        toast.success('Password reset code sent!', {
          description: `Check your inbox (${cleanEmail})`,
        });
        setStep(2);
        setCooldown(30);
      } else {
        setError(result.error || 'Failed to dispatch reset code.');
      }
    } finally {
      setLoading(false);
    }
  }

  // Resend OTP
  async function handleResend() {
    if (cooldown > 0 || !email) return;
    setResending(true);
    setError(null);
    try {
      const result = await forgotPassword(email.trim().toLowerCase());
      if (result.success) {
        toast.success('Fresh reset code sent!');
        setCooldown(45);
      } else {
        setError(result.error || 'Failed to resend code.');
      }
    } finally {
      setResending(false);
    }
  }

  // Step 2: Verify OTP and set new password
  async function handleResetPassword(e) {
    e.preventDefault();
    setError(null);

    if (!otp.trim()) {
      setError('Please enter the 6-digit OTP code.');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const result = await resetPassword({
        email: email.trim().toLowerCase(),
        otp: otp.trim(),
        newPassword,
      });

      if (result.success) {
        setSuccess(true);
        toast.success('Password reset successful!', {
          description: 'You can now sign in with your new password.',
        });
        // Auto-login user with new credentials
        try {
          await login({ email: email.trim().toLowerCase(), password: newPassword });
        } catch {
          // If auto-login fails, they can sign in manually
        }
      } else {
        setError(result.error || 'Invalid or expired OTP code.');
      }
    } finally {
      setLoading(false);
    }
  }

  const goBackToLogin = () => {
    if (typeof onNavigateToLogin === 'function') {
      onNavigateToLogin();
    } else {
      navigate('/login');
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-midnight-bg flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-midnight-card border border-midnight-border rounded-xl p-8 shadow-2xl text-center space-y-5">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mx-auto">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Password Reset Complete</h2>
          <p className="text-sm text-midnight-muted">
            Your password has been successfully updated. Your account is secure.
          </p>
          <Button variant="primary" size="lg" className="w-full" onClick={goBackToLogin}>
            Continue to Account
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-midnight-bg flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        {/* Top Link */}
        <div>
          <button
            onClick={goBackToLogin}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-midnight-muted hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Sign In
          </button>
        </div>

        {/* Card Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-3">
            <ShoppingBag className="h-7 w-7 text-midnight-red" aria-hidden="true" />
            <span className="text-xl font-bold text-midnight-text font-space-grotesk">CoBuy AI</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            {step === 1 ? 'Reset Your Password' : 'Enter Verification Code'}
          </h1>
          <p className="text-xs sm:text-sm text-midnight-muted">
            {step === 1
              ? 'Enter your registered email address to receive a 6-digit recovery code.'
              : `A 6-digit code was sent to ${email}.`}
          </p>
        </div>

        {/* Card Body */}
        <div className="bg-midnight-card border border-midnight-border rounded-xl p-8 shadow-2xl space-y-5">
          {error && (
            <Alert variant="error">
              {error}
            </Alert>
          )}

          {step === 1 ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-midnight-muted">
                  Registered Email Address
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. store@kirana.in"
                  required
                  autoFocus
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
                loading={loading}
              >
                Send 6-Digit Reset Code
              </Button>
            </form>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-midnight-muted">
                    6-Digit Verification Code
                  </label>
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={cooldown > 0 || resending}
                    className="text-xs text-midnight-red hover:underline disabled:opacity-50 disabled:no-underline"
                  >
                    {resending ? 'Sending...' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend Code'}
                  </button>
                </div>
                <Input
                  type="text"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="text-center font-mono tracking-widest text-lg"
                  required
                  autoFocus
                />
                <p className="text-[11px] text-midnight-muted">
                  Tip: Demo code <code className="text-white font-mono">123456</code> or check your email inbox.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-midnight-muted">
                  New Password (min 8 chars)
                </label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-midnight-muted">
                  Confirm New Password
                </label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
                loading={loading}
              >
                Reset Password & Continue
              </Button>

              <button
                type="button"
                onClick={() => setStep(1)}
                className="w-full text-center text-xs text-midnight-muted hover:text-white pt-2"
              >
                ← Change Email Address
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
