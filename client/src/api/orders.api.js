/**
 * CoBuy AI — Orders & PO API Client (SUJ-07 / SRU-05 / SRU-06 / SRU-07)
 *
 * Implements client-side calls for:
 *  - GET   /api/orders                   (List finalized orders)
 *  - GET   /api/orders/:id               (Retrieve order details)
 *  - GET   /api/orders/:id/po-summary    (Download/inspect PO document)
 *  - GET   /api/orders/:id/settlement    (Retrieve supplier settlement)
 *  - PATCH /api/orders/:id/supplier-status (Confirm/reject/dispatch order)
 *  - GET   /api/orders/:id/activity      (Chronological audit activity trail)
 *  - POST  /api/orders/from-pool/:poolId (Generate order from funded pool)
 */

import axiosClient from './axiosClient';

function unwrap(res, fallback = null) {
  if (!res) return fallback;
  const body = res.data;
  if (body && typeof body === 'object' && 'data' in body) {
    return body.data ?? fallback;
  }
  return body ?? fallback;
}

/**
 * List orders for the authenticated user or shop.
 *
 * @param {object} [params={}]
 * @returns {Promise<Array<object>>}
 */
export async function listOrders(params = {}) {
  const res = await axiosClient.get('/orders', { params });
  const data = unwrap(res, []);
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.orders)) return data.orders;
  return [];
}

/**
 * Get detailed order by ID.
 *
 * @param {string} orderId
 * @returns {Promise<object>}
 */
export async function getOrderById(orderId) {
  if (!orderId) throw new Error('Order ID is required.');
  const res = await axiosClient.get(`/orders/${orderId}`);
  return unwrap(res, null);
}

/**
 * Get printable/JSON Purchase Order summary.
 *
 * @param {string} orderId
 * @param {'json'|'html'} [format='json']
 * @returns {Promise<object|string>}
 */
export async function getPoSummary(orderId, format = 'json') {
  if (!orderId) throw new Error('Order ID is required.');
  const res = await axiosClient.get(`/orders/${orderId}/po-summary`, {
    params: { format },
  });
  return unwrap(res, null);
}

/**
 * Get SupplierSettlement status and disclosure for an order.
 *
 * @param {string} orderId
 * @returns {Promise<object>}
 */
export async function getOrderSettlement(orderId) {
  if (!orderId) throw new Error('Order ID is required.');
  const res = await axiosClient.get(`/orders/${orderId}/settlement`);
  return unwrap(res, null);
}

/**
 * Update supplier confirmation status and dispatch tracking.
 *
 * @param {string} orderId
 * @param {object} payload
 * @param {'CONFIRMED'|'REJECTED'} [payload.supplierConfirmationStatus]
 * @param {string} [payload.rejectionReason]
 * @param {'NOT_DISPATCHED'|'DISPATCHED'|'DELIVERED'} [payload.dispatchStatus]
 * @param {string} [payload.deliveryTrackingNumber]
 * @param {string} [payload.carrierName]
 * @returns {Promise<object>}
 */
export async function updateSupplierStatus(orderId, payload) {
  if (!orderId) throw new Error('Order ID is required.');
  const res = await axiosClient.patch(`/orders/${orderId}/supplier-status`, payload);
  return unwrap(res, null);
}

/**
 * Get chronological audit activity trail for an order.
 *
 * @param {string} orderId
 * @returns {Promise<Array<object>>}
 */
export async function getOrderActivity(orderId) {
  if (!orderId) throw new Error('Order ID is required.');
  const res = await axiosClient.get(`/orders/${orderId}/activity`);
  const data = unwrap(res, []);
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.activity)) return data.activity;
  return [];
}

/**
 * Create final order from funded pool (Admin or Wholesaler).
 *
 * @param {string} poolId
 * @returns {Promise<object>}
 */
export async function createOrderFromPool(poolId) {
  if (!poolId) throw new Error('Pool ID is required.');
  const res = await axiosClient.post(`/orders/from-pool/${poolId}`);
  return unwrap(res, null);
}

export const ordersApi = {
  listOrders,
  getOrderById,
  getPoSummary,
  getOrderSettlement,
  updateSupplierStatus,
  getOrderActivity,
  createOrderFromPool,
};

export default ordersApi;
