/**
 * CoBuy AI — Payments & Refunds API Client (SUJ-06)
 *
 * Implements client-side calls for:
 *  - POST /api/payments/create-order       (Create PayPal Sandbox order with server-derived amount)
 *  - POST /api/payments/:paymentId/capture (Authoritative server-side capture verification)
 *  - POST /api/payments/:paymentId/cancel  (Cancel checkout attempt)
 *  - GET  /api/payments                    (List authenticated shop's payment history)
 *  - POST /api/payments/:paymentId/reconcile (Reconcile pending/unknown payment state)
 *  - GET  /api/refunds                     (List authenticated shop's refund history)
 *  - GET  /api/refunds/:id                 (Retrieve single refund details)
 *  - POST /api/refunds/initiate            (Initiate full or partial refund against captured payment)
 *  - POST /api/refunds/tier-drop-savings   (Bulk tier-drop savings refunds)
 */

import axiosClient from './axiosClient';

/**
 * Normalizes API response defensively, extracting the payload from standard
 * APIResponse wrappers ({ statusCode, success, data }) or direct response objects.
 *
 * @param {object} res - Axios-compatible response object
 * @param {any} fallback - Default fallback if data is missing
 * @returns {any}
 */
function unwrap(res, fallback = null) {
  if (!res) return fallback;
  const body = res.data;
  if (body && typeof body === 'object' && 'data' in body) {
    return body.data ?? fallback;
  }
  return body ?? fallback;
}

/**
 * Generate a unique client-side idempotency key for payment operations.
 *
 * @param {string} prefix
 * @returns {string}
 */
export function generateIdempotencyKey(prefix = 'pay') {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${ts}-${rand}`;
}

/**
 * Create a PayPal Sandbox order.
 * Amount is derived exclusively on the backend from the Contribution / PriceSnapshot (FR-PAY-001).
 * The client MUST NOT supply amountMinor.
 *
 * @param {object} params
 * @param {string} params.contributionId - Contribution ID to pay for
 * @param {'INITIAL_JOIN'|'QUANTITY_INCREASE_DELTA'|'POST_APPROVAL_FINAL'|'UNDER_MOQ_SURCHARGE'} params.paymentPurpose
 * @param {string} [params.idempotencyKey] - Unique key (>= 8 chars)
 * @param {string} [params.priceSnapshotId] - Required for POST_APPROVAL_FINAL
 * @param {string} [params.returnUrl] - Browser redirect URL on approval
 * @param {string} [params.cancelUrl] - Browser redirect URL on cancellation
 * @returns {Promise<{ paymentId: string, providerOrderId: string, approveUrl: string, amountMinor: number, currency: string, paymentStatus: string, isTestTransaction: boolean, provider: string, isDuplicate: boolean }>}
 */
export async function createPaymentOrder({
  contributionId,
  paymentPurpose,
  idempotencyKey,
  priceSnapshotId = null,
  returnUrl,
  cancelUrl,
}) {
  const payload = {
    contributionId,
    paymentPurpose,
    idempotencyKey: idempotencyKey || generateIdempotencyKey('ord'),
  };

  if (priceSnapshotId) {
    payload.priceSnapshotId = priceSnapshotId;
  }
  if (returnUrl) {
    payload.returnUrl = returnUrl;
  }
  if (cancelUrl) {
    payload.cancelUrl = cancelUrl;
  }

  const res = await axiosClient.post('/payments/create-order', payload);
  return unwrap(res, {});
}

/**
 * Authoritative server-side capture verification.
 * This is the ONLY endpoint permitted to mark a payment as 'PAID' (FR-PAY-002 / FR-PAY-007).
 *
 * @param {string} paymentId - Database Payment ID
 * @param {object} params
 * @param {string} params.providerOrderId - PayPal order ID returned by SDK upon approval
 * @returns {Promise<{ payment: object, contribution: object, isDuplicate: boolean }>}
 */
export async function capturePaymentOrder(paymentId, { providerOrderId, providerCaptureId } = {}) {
  if (!paymentId) throw new Error('paymentId is required for capture.');
  if (!providerOrderId) throw new Error('providerOrderId is required for capture.');

  const payload = { providerOrderId };
  if (providerCaptureId) {
    payload.providerCaptureId = providerCaptureId;
  }

  const res = await axiosClient.post(`/payments/${paymentId}/capture`, payload);
  return unwrap(res, {});
}

/**
 * Marks a payment as CANCELLED when the buyer dismisses or cancels PayPal checkout.
 * Contribution remains in PENDING_PAYMENT — buyer may retry.
 *
 * @param {string} paymentId - Database Payment ID
 * @returns {Promise<{ payment: object }>}
 */
export async function cancelPaymentOrder(paymentId) {
  if (!paymentId) throw new Error('paymentId is required to cancel checkout.');

  const res = await axiosClient.post(`/payments/${paymentId}/cancel`, {});
  return unwrap(res, {});
}

/**
 * List payment history for the authenticated shop (paginated).
 *
 * @param {object} [params={}]
 * @param {number} [params.page=1]
 * @param {number} [params.limit=20]
 * @returns {Promise<{ payments: Array<object>, total: number, page: number, limit: number }>}
 */
export async function listPayments({ page = 1, limit = 20 } = {}) {
  const res = await axiosClient.get('/payments', {
    params: { page, limit },
  });
  return unwrap(res, { payments: [], total: 0, page, limit });
}

/**
 * Reconcile unknown or pending payment with the payment provider.
 *
 * @param {string} paymentId
 * @returns {Promise<object>}
 */
export async function reconcilePayment(paymentId) {
  if (!paymentId) throw new Error('paymentId is required for reconciliation.');

  const res = await axiosClient.post(`/payments/${paymentId}/reconcile`, {});
  return unwrap(res, {});
}

/**
 * List refund history for the authenticated shop (paginated).
 *
 * @param {object} [params={}]
 * @param {number} [params.page=1]
 * @param {number} [params.limit=20]
 * @returns {Promise<{ refunds: Array<object>, total: number, page: number, limit: number }>}
 */
export async function listRefunds({ page = 1, limit = 20 } = {}) {
  const res = await axiosClient.get('/refunds', {
    params: { page, limit },
  });
  return unwrap(res, { refunds: [], total: 0, page, limit });
}

/**
 * Retrieve single refund details by ID.
 *
 * @param {string} refundId
 * @returns {Promise<{ refund: object }>}
 */
export async function getRefundById(refundId) {
  if (!refundId) throw new Error('refundId is required.');

  const res = await axiosClient.get(`/refunds/${refundId}`);
  return unwrap(res, {});
}

/**
 * Initiate a full or partial refund against a captured payment.
 *
 * @param {object} params
 * @param {string} params.paymentId
 * @param {number} [params.amountMinor] - If omitted, full refund
 * @param {string} params.reason
 * @param {string} [params.idempotencyKey]
 * @param {object} [params.metadata]
 * @returns {Promise<{ refund: object, isDuplicate: boolean }>}
 */
export async function initiateRefund({
  paymentId,
  amountMinor,
  reason,
  idempotencyKey,
  metadata = {},
}) {
  const payload = {
    paymentId,
    reason,
    idempotencyKey: idempotencyKey || generateIdempotencyKey('ref'),
    metadata,
  };
  if (amountMinor !== undefined && amountMinor !== null) {
    payload.amountMinor = amountMinor;
  }

  const res = await axiosClient.post('/refunds/initiate', payload);
  return unwrap(res, {});
}

/**
 * Trigger bulk tier-drop savings refunds for a locked pool.
 *
 * @param {object} params
 * @param {string} params.poolId
 * @param {string} params.priceSnapshotId
 * @returns {Promise<{ poolId: string, refundsCount: number, totalRefundedMinor: number, refunds: Array<object> }>}
 */
export async function triggerTierDropRefunds({ poolId, priceSnapshotId }) {
  const res = await axiosClient.post('/refunds/tier-drop-savings', {
    poolId,
    priceSnapshotId,
  });
  return unwrap(res, {});
}

export const paymentsApi = {
  createPaymentOrder,
  capturePaymentOrder,
  cancelPaymentOrder,
  listPayments,
  reconcilePayment,
  listRefunds,
  getRefundById,
  initiateRefund,
  triggerTierDropRefunds,
  generateIdempotencyKey,
};

export default paymentsApi;
