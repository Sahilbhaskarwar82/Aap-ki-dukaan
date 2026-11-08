/**
 * CoBuy AI — Administrator & Moderation API Client (SUJ-09 / SRU-10)
 *
 * Implements client-side calls for:
 *  - GET  /api/admin/reconciliation              (Reconciliation dashboard exceptions)
 *  - POST /api/admin/reconciliation/:id/annotate (Append notes without overwriting captured facts)
 *  - GET  /api/admin/audit-logs                  (Immutable audit log inspector)
 *  - POST /api/admin/jobs/run-lifecycle-check    (Execute 72h/24h scheduler check)
 *  - POST /api/admin/suppliers                   (Create/verify supplier)
 *  - PATCH /api/admin/suppliers/:id              (Update supplier status/provenance)
 *  - POST /api/admin/offers                      (Create catalogue offer)
 *  - PATCH /api/admin/offers/:id                 (Update offer pricing/terms)
 *  - GET  /api/suppliers                         (Catalogue supplier listing helper)
 *  - GET  /api/offers/search                     (Catalogue offer listing helper)
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
 * Fetch platform reconciliation dashboard metrics and exceptions.
 *
 * GET /api/admin/reconciliation
 * Accessible to ADMIN and REVIEWER.
 *
 * @returns {Promise<{
 *   summary: {
 *     stalledPoolsCount: number,
 *     expiredQuotesCount: number,
 *     attentionPaymentsCount: number,
 *     failedRefundsCount: number,
 *     failedAiLogsCount: number
 *   },
 *   stalledPools: Array<object>,
 *   expiredQuotes: Array<object>,
 *   attentionPayments: Array<object>,
 *   failedRefunds: Array<object>,
 *   failedAiLogs: Array<object>
 * }>}
 */
export async function getReconciliationDashboard() {
  const res = await axiosClient.get('/admin/reconciliation');
  return unwrap(res, {
    summary: {
      stalledPoolsCount: 0,
      expiredQuotesCount: 0,
      attentionPaymentsCount: 0,
      failedRefundsCount: 0,
      failedAiLogsCount: 0,
    },
    stalledPools: [],
    expiredQuotes: [],
    attentionPayments: [],
    failedRefunds: [],
    failedAiLogs: [],
  });
}

/**
 * Append an immutable reconciliation note to a payment record (FR-ADMIN-005).
 * Payment captured facts are never overwritten.
 *
 * POST /api/admin/reconciliation/:paymentId/annotate
 * Accessible to ADMIN only.
 *
 * @param {string} paymentId
 * @param {object} payload
 * @param {string} payload.note
 * @param {boolean} [payload.syncWithProvider=false]
 * @returns {Promise<object>}
 */
export async function annotatePayment(paymentId, payload) {
  if (!paymentId) throw new Error('Payment ID is required.');
  if (!payload?.note || !payload.note.trim()) {
    throw new Error('Reconciliation note is required.');
  }

  const res = await axiosClient.post(`/admin/reconciliation/${paymentId}/annotate`, {
    note: payload.note.trim(),
    syncWithProvider: Boolean(payload.syncWithProvider),
  });
  return unwrap(res, null);
}

/**
 * Fetch immutable platform audit logs.
 *
 * GET /api/admin/audit-logs
 * Accessible to ADMIN and REVIEWER.
 *
 * @param {object} [params={}]
 * @param {string} [params.correlationId]
 * @param {string} [params.action]
 * @param {string} [params.resourceType]
 * @param {string} [params.actorRole]
 * @param {string} [params.actorId]
 * @param {string} [params.poolId]
 * @param {string} [params.orderId]
 * @param {number} [params.page=1]
 * @param {number} [params.limit=50]
 * @returns {Promise<{
 *   auditLogs: Array<object>,
 *   total: number,
 *   page: number,
 *   limit: number,
 *   pages: number
 * }>}
 */
export async function getAuditLogs(params = {}) {
  const cleanParams = {};
  if (params.correlationId?.trim()) cleanParams.correlationId = params.correlationId.trim();
  if (params.action?.trim()) cleanParams.action = params.action.trim();
  if (params.resourceType && params.resourceType !== 'ALL') cleanParams.resourceType = params.resourceType.trim();
  if (params.actorRole && params.actorRole !== 'ALL') cleanParams.actorRole = params.actorRole.trim();
  if (params.actorId?.trim()) cleanParams.actorId = params.actorId.trim();
  if (params.poolId?.trim()) cleanParams.poolId = params.poolId.trim();
  if (params.orderId?.trim()) cleanParams.orderId = params.orderId.trim();
  if (params.page) cleanParams.page = Number(params.page);
  if (params.limit) cleanParams.limit = Number(params.limit);

  const res = await axiosClient.get('/admin/audit-logs', { params: cleanParams });
  return unwrap(res, {
    auditLogs: [],
    total: 0,
    page: 1,
    limit: 50,
    pages: 1,
  });
}

/**
 * Trigger server-side 72h/24h pool deadline and decision window lifecycle evaluation.
 * In non-production environments, accepts test clock offset hours.
 *
 * POST /api/admin/jobs/run-lifecycle-check
 * Accessible to ADMIN only.
 *
 * @param {number} [offsetHours=0]
 * @returns {Promise<{
 *   timestamp: string,
 *   results: {
 *     lockedMoqReached?: number,
 *     lockedUnderMoq?: number,
 *     expiredDecisionWindowsProcessed?: number
 *   }
 * }>}
 */
export async function runLifecycleCheck(offsetHours = 0) {
  const res = await axiosClient.post('/admin/jobs/run-lifecycle-check', {
    offsetHours: Number(offsetHours) || 0,
  });
  return unwrap(res, null);
}

/**
 * Create a new supplier with verification and provenance status.
 *
 * POST /api/admin/suppliers
 * Accessible to ADMIN only.
 *
 * @param {object} payload
 * @param {string} payload.name
 * @param {object} [payload.contactReference]
 * @param {string[]} payload.serviceAreas
 * @param {string} [payload.verificationStatus='VERIFIED']
 * @param {string} [payload.dataSourceType='VERIFIED_LIVE']
 * @param {string} [payload.ownerUserId]
 * @returns {Promise<object>}
 */
export async function createSupplier(payload) {
  if (!payload?.name || !payload.name.trim()) {
    throw new Error('Supplier company name is required.');
  }
  if (!payload?.serviceAreas || !Array.isArray(payload.serviceAreas) || payload.serviceAreas.length === 0) {
    throw new Error('At least one service area is required.');
  }

  const res = await axiosClient.post('/admin/suppliers', payload);
  return unwrap(res, null);
}

/**
 * Update an existing supplier profile and provenance.
 * Permitted fields: name, contactReference, serviceAreas, verificationStatus, activeStatus, dataSourceType.
 *
 * PATCH /api/admin/suppliers/:id
 * Accessible to ADMIN only.
 *
 * @param {string} supplierId
 * @param {object} payload
 * @returns {Promise<object>}
 */
export async function updateSupplier(supplierId, payload) {
  if (!supplierId) throw new Error('Supplier ID is required.');
  const res = await axiosClient.patch(`/admin/suppliers/${supplierId}`, payload);
  return unwrap(res, null);
}

/**
 * Create a wholesale catalogue offer.
 *
 * POST /api/admin/offers
 * Accessible to ADMIN or assigned SUPPLIER.
 *
 * @param {object} payload
 * @returns {Promise<object>}
 */
export async function createOffer(payload) {
  const res = await axiosClient.post('/admin/offers', payload);
  return unwrap(res, null);
}

/**
 * Update an existing wholesale catalogue offer.
 * Permitted fields: baseUnitPriceMinor, quantityTiers, minimumOrderQuantity, retailerMoqPercentage,
 * retailerStepPercentage, minRetailerQuantityOverride, quantityStepMultipleOverride, acceptsUnderMoqOrders,
 * deliveryAreas, leadTimeDays, shippingTerms, flatShippingCostMinor, shippingAllocationMethod, taxInclusion,
 * availabilityStatus, expiresAt, dataSourceType, verificationStatus.
 *
 * PATCH /api/admin/offers/:id
 * Accessible to ADMIN or assigned SUPPLIER.
 *
 * @param {string} offerId
 * @param {object} payload
 * @returns {Promise<object>}
 */
export async function updateOffer(offerId, payload) {
  if (!offerId) throw new Error('Offer ID is required.');
  const res = await axiosClient.patch(`/admin/offers/${offerId}`, payload);
  return unwrap(res, null);
}

/**
 * Helper to fetch suppliers for administrative inspection.
 * Uses the public GET /suppliers endpoint with activeStatus='ALL' by default.
 *
 * GET /api/suppliers
 *
 * @param {object} [params={}]
 * @returns {Promise<{ suppliers: Array<object>, pagination: object }>}
 */
export async function listSuppliersForAdmin(params = {}) {
  const query = {
    activeStatus: 'ALL',
    limit: 50,
    ...params,
  };
  const res = await axiosClient.get('/suppliers', { params: query });
  return unwrap(res, { suppliers: [], pagination: { totalCount: 0, page: 1, limit: 50, totalPages: 1 } });
}

/**
 * Helper to fetch catalogue offers for administrative inspection.
 * Uses GET /offers/search with includeExpired=true by default.
 * Note: Limited by the underlying search query (starts with isActive: true unless includeExpired).
 *
 * GET /api/offers/search
 *
 * @param {object} [params={}]
 * @returns {Promise<{ offers: Array<object>, pagination: object }>}
 */
export async function searchOffersForAdmin(params = {}) {
  const query = {
    includeExpired: true,
    limit: 50,
    ...params,
  };
  const res = await axiosClient.get('/offers/search', { params: query });
  return unwrap(res, { offers: [], pagination: { totalCount: 0, page: 1, limit: 50, totalPages: 1 } });
}


/**
 * Query immutable AIExecutionLog records with filters.
 *
 * GET /api/admin/ai-logs
 *
 * @param {object} [params={}]
 * @returns {Promise<{ aiLogs: Array<object>, total: number, page: number, limit: number, pages: number }>}
 */
export async function getAILogs(params = {}) {
  const query = {
    page: 1,
    limit: 50,
    ...params,
  };
  const res = await axiosClient.get('/admin/ai-logs', { params: query });
  return unwrap(res, { aiLogs: [], total: 0, page: 1, limit: 50, pages: 1 });
}

export const adminApi = {
  getAILogs,
  getReconciliationDashboard,
  annotatePayment,
  getAuditLogs,
  runLifecycleCheck,
  createSupplier,
  updateSupplier,
  createOffer,
  updateOffer,
  listSuppliersForAdmin,
  searchOffersForAdmin,
};

export default adminApi;
