/**
 * CoBuy AI — Authentication API (HIM-02 / PRK-03)
 *
 * Implements the client-side calls:
 *  - POST /auth/register
 *  - POST /auth/login
 *  - POST /auth/logout
 *  - GET  /auth/me
 *  - POST /auth/send-otp
 *  - POST /auth/resend-otp
 *  - POST /auth/verify-otp
 *  - POST /auth/send-login-otp
 *  - POST /auth/login-with-otp
 *  - POST /auth/forgot-password
 *  - POST /auth/reset-password
 */

import axiosClient from './axiosClient';

/**
 * Register a new user account and associated shop (if SHOP_OWNER).
 */
export async function registerUser(payload) {
  const response = await axiosClient.post('/auth/register', payload);
  return response.data;
}

/**
 * Sign in existing user with email and password credentials.
 */
export async function loginUser(credentials) {
  const response = await axiosClient.post('/auth/login', credentials);
  return response.data;
}

/**
 * Sign out authenticated user and invalidate session cookie.
 */
export async function logoutUser() {
  const response = await axiosClient.post('/auth/logout');
  return response.data;
}

/**
 * Fetch authenticated user profile and associated shop if retailer.
 */
export async function getCurrentUser() {
  const response = await axiosClient.get('/auth/me');
  return response.data;
}

/**
 * Request a fresh verification OTP for user's email.
 */
export async function sendOtp(email) {
  const response = await axiosClient.post('/auth/send-otp', { email });
  return response.data;
}

export async function resendOtp(email) {
  const response = await axiosClient.post('/auth/resend-otp', { email });
  return response.data;
}

/**
 * Verify 2FA / registration OTP and issue authenticated session tokens.
 */
export async function verifyOtp({ email, otp }) {
  const response = await axiosClient.post('/auth/verify-otp', { email, otp });
  return response.data;
}

/**
 * Request passwordless sign-in OTP for registered email.
 */
export async function sendLoginOtp(email) {
  const response = await axiosClient.post('/auth/send-login-otp', { email });
  return response.data;
}

/**
 * Passwordless sign-in using 6-digit OTP code.
 */
export async function loginWithOtp({ email, otp }) {
  const response = await axiosClient.post('/auth/login-with-otp', { email, otp });
  return response.data;
}

/**
 * Request password reset OTP.
 */
export async function forgotPassword(email) {
  const response = await axiosClient.post('/auth/forgot-password', { email });
  return response.data;
}

/**
 * Reset password using verification OTP.
 */
export async function resetPassword({ email, otp, newPassword }) {
  const response = await axiosClient.post('/auth/reset-password', { email, otp, newPassword });
  return response.data;
}

export default {
  registerUser,
  loginUser,
  logoutUser,
  getCurrentUser,
  sendOtp,
  resendOtp,
  verifyOtp,
  sendLoginOtp,
  loginWithOtp,
  forgotPassword,
  resetPassword,
};
