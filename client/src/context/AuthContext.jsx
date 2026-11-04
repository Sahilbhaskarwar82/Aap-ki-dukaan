/**
 * CoBuy AI — AuthContext (HIM-02)
 *
 * Provides authenticated user state across the application.
 *
 * Contract based on actual PRK-03 backend:
 *  - User roles: 'SHOP_OWNER' | 'SUPPLIER' | 'ADMIN' | 'REVIEWER'
 *  - Auth mechanism: HttpOnly cookie 'token' + Bearer token in Authorization header
 *  - Token also returned in response.data.token for localStorage fallback (per auth.controller.js)
 *  - GET /api/auth/me returns { user, shop } where shop is present if role === 'SHOP_OWNER'
 *  - POST /api/auth/login and /register return { user, shop, token }
 *
 * Provides:
 *  - user, shop, loading, authError
 *  - login(credentials)
 *  - register(payload)
 *  - logout()
 *  - refreshUser()
 *  - isShopOwner, isSupplier, isAdmin, isReviewer (role helper flags)
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  loginUser,
  registerUser,
  logoutUser,
  getCurrentUser,
  sendOtp as apiSendOtp,
  resendOtp as apiResendOtp,
  verifyOtp as apiVerifyOtp,
  sendLoginOtp as apiSendLoginOtp,
  loginWithOtp as apiLoginWithOtp,
  forgotPassword as apiForgotPassword,
  resetPassword as apiResetPassword,
} from '@/api/auth.api';
import { setAuthToken, clearAuthToken } from '@/api/axiosClient';

const AuthContext = createContext(null);

/**
 * AuthProvider wraps the application and manages authentication state.
 */
export function AuthProvider({ children }) {
  const [user, setUser]         = useState(null);
  const [shop, setShop]         = useState(null);
  const [loading, setLoading]   = useState(true);  // true on mount while restoring session
  const [authError, setAuthError] = useState(null);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ── Session Restoration ────────────────────────────────────────────────────
  /**
   * Attempt to restore an existing session via GET /auth/me.
   * Handles 401 gracefully (unauthenticated), surfaces only unexpected errors.
   */
  const restoreSession = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getCurrentUser();
      if (mountedRef.current) {
        setUser(result.data.user);
        setShop(result.data.shop || null);
        setAuthError(null);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      // 401 = not authenticated — clear state silently
      if (err.status === 401 || err.statusCode === 401) {
        clearAuthToken();
        setUser(null);
        setShop(null);
      } else {
        // Unexpected error (network failure, server error): preserve null user,
        // set error so components can show appropriate messaging.
        setAuthError(err.message || 'Failed to restore session.');
        setUser(null);
        setShop(null);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // Restore session on mount only once
  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  // ── Login ──────────────────────────────────────────────────────────────────
  /**
   * Authenticate with email and password (and optional 2FA OTP).
   * Returns { success, user, shop, requireOtp, error } — never throws to the caller.
   */
  const login = useCallback(async ({ email, password, otp, skipOtp }) => {
    setAuthError(null);
    try {
      const result = await loginUser({ email, password, otp, skipOtp });

      // If backend prompts for OTP on email (2-step authentication)
      if (result.data?.requireOtp) {
        return {
          success: true,
          requireOtp: true,
          email: result.data.email,
          message: result.message,
        };
      }

      const { user: loggedUser, shop: loggedShop, token } = result.data;

      if (token) {
        setAuthToken(token);
      }

      if (mountedRef.current) {
        setUser(loggedUser);
        setShop(loggedShop || null);
      }

      return { success: true, user: loggedUser, shop: loggedShop, token };
    } catch (err) {
      const message = err.message || 'Login failed. Please try again.';
      if (mountedRef.current) {
        setAuthError(message);
      }
      return { success: false, error: message, errors: err.errors || [message] };
    }
  }, []);

  // ── Register ───────────────────────────────────────────────────────────────
  /**
   * Create a new account.
   * Returns { success, user, shop, token, error }.
   *
   * Registration roles allowed by backend (PRK-03): SHOP_OWNER, SUPPLIER.
   * ADMIN and REVIEWER are not publicly registerable.
   */
  const register = useCallback(async (payload) => {
    setAuthError(null);
    try {
      const result = await registerUser(payload);
      const { user: newUser, shop: newShop, token } = result.data;

      if (token) {
        setAuthToken(token);
      }

      // Backend returns token on registration; treat as auto-logged-in
      if (mountedRef.current) {
        setUser(newUser);
        setShop(newShop || null);
      }

      return { success: true, user: newUser, shop: newShop, token };
    } catch (err) {
      const message = err.message || 'Registration failed. Please try again.';
      if (mountedRef.current) {
        setAuthError(message);
      }
      return { success: false, error: message, errors: err.errors || [message] };
    }
  }, []);

  // ── Passwordless OTP Login ─────────────────────────────────────────────────
  const sendLoginOtp = useCallback(async (email) => {
    try {
      const result = await apiSendLoginOtp(email);
      return { success: true, message: result.message, data: result.data };
    } catch (err) {
      const message = err.message || 'Failed to dispatch login OTP.';
      return { success: false, error: message };
    }
  }, []);

  const loginWithOtp = useCallback(async ({ email, otp }) => {
    setAuthError(null);
    try {
      const result = await apiLoginWithOtp({ email, otp });
      const { user: loggedUser, shop: loggedShop, token } = result.data;

      if (token) {
        setAuthToken(token);
      }

      if (mountedRef.current) {
        setUser(loggedUser);
        setShop(loggedShop || null);
      }

      return { success: true, user: loggedUser, shop: loggedShop, token };
    } catch (err) {
      const message = err.message || 'OTP login failed. Please try again.';
      if (mountedRef.current) {
        setAuthError(message);
      }
      return { success: false, error: message, errors: err.errors || [message] };
    }
  }, []);

  // ── OTP Verification & Activation (Registration Auto-Login) ────────────────
  const verifyOtp = useCallback(async ({ email, otp }) => {
    setAuthError(null);
    try {
      const result = await apiVerifyOtp({ email, otp });
      const { user: verifiedUser, shop: verifiedShop, token } = result.data;

      if (token) {
        setAuthToken(token);
      }

      if (mountedRef.current) {
        setUser(verifiedUser);
        setShop(verifiedShop || null);
      }

      return { success: true, user: verifiedUser, shop: verifiedShop, token };
    } catch (err) {
      const message = err.message || 'Verification failed. Please try again.';
      if (mountedRef.current) {
        setAuthError(message);
      }
      return { success: false, error: message, errors: err.errors || [message] };
    }
  }, []);

  const resendOtp = useCallback(async (email) => {
    try {
      const result = await apiResendOtp(email);
      return { success: true, message: result.message, data: result.data };
    } catch (err) {
      return { success: false, error: err.message || 'Failed to resend code.' };
    }
  }, []);

  // ── Forgot & Reset Password ────────────────────────────────────────────────
  const forgotPassword = useCallback(async (email) => {
    try {
      const result = await apiForgotPassword(email);
      return { success: true, message: result.message, data: result.data };
    } catch (err) {
      return { success: false, error: err.message || 'Failed to dispatch reset OTP.' };
    }
  }, []);

  const resetPassword = useCallback(async ({ email, otp, newPassword }) => {
    try {
      const result = await apiResetPassword({ email, otp, newPassword });
      return { success: true, message: result.message, data: result.data };
    } catch (err) {
      return { success: false, error: err.message || 'Failed to reset password.' };
    }
  }, []);

  // ── Logout ─────────────────────────────────────────────────────────────────
  /**
   * Clear the authenticated session on both client and server.
   */
  const logout = useCallback(async () => {
    try {
      await logoutUser();
    } catch {
      // Ignore server errors during logout — clear client state regardless
    } finally {
      clearAuthToken();
      if (mountedRef.current) {
        setUser(null);
        setShop(null);
        setAuthError(null);
      }
    }
  }, []);

  // ── Refresh User ───────────────────────────────────────────────────────────
  /**
   * Force re-fetch of the current user profile.
   * Useful after profile updates.
   */
  const refreshUser = useCallback(async () => {
    try {
      const result = await getCurrentUser();
      if (mountedRef.current) {
        setUser(result.data.user);
        setShop(result.data.shop || null);
      }
    } catch (err) {
      if (err.status === 401 || err.statusCode === 401) {
        clearAuthToken();
        if (mountedRef.current) {
          setUser(null);
          setShop(null);
        }
      }
    }
  }, []);

  // ── Role Helper Flags ──────────────────────────────────────────────────────
  const isShopOwner = user?.role === 'SHOP_OWNER';
  const isSupplier  = user?.role === 'SUPPLIER';
  const isAdmin     = user?.role === 'ADMIN';
  const isReviewer  = user?.role === 'REVIEWER';
  const isAuthenticated = !!user;

  const value = {
    user,
    shop,
    loading,
    authError,
    isAuthenticated,
    isShopOwner,
    isSupplier,
    isAdmin,
    isReviewer,
    login,
    loginWithOtp,
    sendLoginOtp,
    register,
    verifyOtp,
    resendOtp,
    forgotPassword,
    resetPassword,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * useAuth — hook to consume AuthContext.
 * Must be called inside an AuthProvider.
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

/**
 * useOptionalAuth — safely consumes AuthContext without throwing if outside AuthProvider.
 */
export function useOptionalAuth() {
  return useContext(AuthContext);
}

export default AuthContext;
