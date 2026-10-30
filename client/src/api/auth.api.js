/**
 * CoBuy AI — Authentication API (HIM-02)
 *
 * Implements the client-side calls for PRK-03:
 *  - POST /auth/register
 *  - POST /auth/login
 *  - POST /auth/logout
 *  - GET  /auth/me
 */

import axiosClient from './axiosClient';

/**
 * Register a new user account and associated shop (if SHOP_OWNER).
 *
 * @param {object} payload
 * @param {string} payload.name
 * @param {string} payload.email
 * @param {string} payload.password
 * @param {('SHOP_OWNER'|'SUPPLIER'|'ADMIN'|'REVIEWER')} [payload.role='SHOP_OWNER']
 * @param {object} [payload.shopDetails] Required if role === 'SHOP_OWNER'
 * @returns {Promise<{ statusCode: number, success: boolean, message: string, data: { user: object, shop: object|null, token: string } }>}
 */
export async function registerUser(payload) {
  const response = await axiosClient.post('/auth/register', payload);
  return response.data;
}

/**
 * Sign in existing user with email and password credentials.
 *
 * @param {object} credentials
 * @param {string} credentials.email
 * @param {string} credentials.password
 * @returns {Promise<{ statusCode: number, success: boolean, message: string, data: { user: object, shop: object|null, token: string } }>}
 */
export async function loginUser(credentials) {
  const response = await axiosClient.post('/auth/login', credentials);
  return response.data;
}

/**
 * Sign out authenticated user and invalidate session cookie.
 *
 * @returns {Promise<{ statusCode: number, success: boolean, message: string, data: null }>}
 */
export async function logoutUser() {
  const response = await axiosClient.post('/auth/logout');
  return response.data;
}

/**
 * Fetch authenticated user profile and associated shop if retailer.
 *
 * @returns {Promise<{ statusCode: number, success: boolean, message: string, data: { user: object, shop: object|null } }>}
 */
export async function getCurrentUser() {
  const response = await axiosClient.get('/auth/me');
  return response.data;
}

export default {
  registerUser,
  loginUser,
  logoutUser,
  getCurrentUser,
};
