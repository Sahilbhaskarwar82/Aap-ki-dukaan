/**
 * CoBuy AI — Supplier & Wholesale Offer Catalogue API Client (HIM-09)
 *
 * Implements client-side API integrations conforming to backend tasks SAH-05 and SAH-07:
 *  - GET  /api/offers/search: Multi-faceted catalogue offer search (deliveryArea, category, maxMoq, includeExpired)
 *  - POST /api/offers/compare: Deterministic landed-cost comparison & AI trade-off advisory (SAH-07)
 *  - GET  /api/suppliers: Search & list verified wholesale distributors (SAH-05)
 *  - GET  /api/suppliers/:id: Retrieve individual supplier by ID
 *  - GET  /api/products/search: Master product catalogue full-text and facet search
 */

import axiosClient from '@/api/axiosClient';

// ─── Provenance Types (Supplier & Offer Model) ────────────────────────────────
export const PROVENANCE_TYPE = {
  SEEDED_DEMO: 'SEEDED_DEMO',
  SUPPLIER_SUBMITTED: 'SUPPLIER_SUBMITTED',
  VERIFIED_LIVE: 'VERIFIED_LIVE',
  EXTERNAL_API: 'EXTERNAL_API',
};

export const PROVENANCE_DISPLAY = {
  SEEDED_DEMO: {
    label: 'DEMO SAMPLE DATA',
    variant: 'provenance',
    description: 'Seeded sample data for hackathon demonstration purposes. Not a real supplier quote.',
    isVerified: false,
  },
  SUPPLIER_SUBMITTED: {
    label: 'SUPPLIER SUBMITTED',
    variant: 'pool',
    description: 'Submitted directly by a registered wholesaler — pending platform field verification.',
    isVerified: false,
  },
  VERIFIED_LIVE: {
    label: 'VERIFIED LIVE',
    variant: 'success',
    description: 'Verified live supplier quote with confirmed pricing and fulfillment SLA.',
    isVerified: true,
  },
  EXTERNAL_API: {
    label: 'EXTERNAL SOURCE',
    variant: 'outline',
    description: 'Imported from an external vendor catalogue API. Verification status unknown.',
    isVerified: false,
  },
  // Fallback for unknown provenance types
  UNKNOWN: {
    label: 'UNVERIFIED',
    variant: 'outline',
    description: 'Provenance not confirmed. Treat quote with caution.',
    isVerified: false,
  },
};

// ─── Supported Product Categories (Product.model.js backend enum) ─────────────
// These values MUST match the Product model's category field exactly.
// Do NOT include "GROCERIES" — it is not a valid backend category.
export const CATEGORY_OPTIONS = [
  { value: 'ALL', label: 'All Categories' },
  { value: 'GRAINS', label: 'Grains & Rice' },
  { value: 'PULSES', label: 'Pulses & Legumes' },
  { value: 'SPICES', label: 'Spices & Masalas' },
  { value: 'EDIBLE_OILS', label: 'Edible Oils & Fats' },
  { value: 'DAIRY', label: 'Dairy Products' },
  { value: 'BEVERAGES', label: 'Beverages & Drinks' },
  { value: 'SNACKS', label: 'Snacks & Ready Foods' },
  { value: 'PACKAGING', label: 'Packaging Materials' },
  { value: 'CLEANING', label: 'Cleaning & Hygiene' },
  { value: 'PERSONAL_CARE', label: 'Personal Care' },
  { value: 'OTHER', label: 'Other' },
];

// ─── Supported Regional Delivery Areas (matching backend deliveryAreas enum) ──
export const DELIVERY_AREAS = [
  { value: 'ALL', label: 'All Delivery Areas' },
  { value: 'DELHI_NCR', label: 'Delhi NCR' },
  { value: 'MUMBAI_METRO', label: 'Mumbai Metro' },
  { value: 'BANGALORE', label: 'Bangalore' },
  { value: 'HYDERABAD', label: 'Hyderabad' },
  { value: 'PUNE', label: 'Pune' },
  { value: 'CHENNAI', label: 'Chennai' },
  { value: 'AHMEDABAD', label: 'Ahmedabad' },
  { value: 'CHANDIGARH', label: 'Chandigarh' },
  { value: 'ALL_INDIA', label: 'All India' },
];

// ─── Sorting Criteria ─────────────────────────────────────────────────────────
export const SORT_OPTIONS = {
  LOWEST_LANDED_COST: 'LOWEST_LANDED_COST',
  LOWEST_MOQ: 'LOWEST_MOQ',
  FRESHEST_QUOTE: 'FRESHEST_QUOTE',
};

export const SORT_LABELS = [
  { value: SORT_OPTIONS.LOWEST_LANDED_COST, label: 'Lowest Landed Cost' },
  { value: SORT_OPTIONS.LOWEST_MOQ, label: 'Lowest Wholesale MOQ' },
  { value: SORT_OPTIONS.FRESHEST_QUOTE, label: 'Freshest Quote' },
];

// ─── Preset MOQ Threshold Options ─────────────────────────────────────────────
export const MOQ_FILTER_OPTIONS = [
  { value: 'ALL', label: 'Any Wholesale MOQ' },
  { value: '100', label: 'Up to 100 units' },
  { value: '250', label: 'Up to 250 units' },
  { value: '500', label: 'Up to 500 units' },
  { value: '1000', label: 'Up to 1,000 units' },
  { value: '2500', label: 'Up to 2,500 units' },
];

// ─── API Functions ────────────────────────────────────────────────────────────

/**
 * Searches active wholesale supplier offers matching filters.
 *
 * GET /api/offers/search
 * Supported query params: category, deliveryArea, maxMoq, dataSourceType, includeExpired, page, limit
 *
 * @param {object} [params={}]
 * @returns {Promise<{data: {statusCode: number, data: {offers: object[], pagination: object}, message: string}}>}
 */
export async function searchOffers(params = {}) {
  const cleanParams = {};
  if (params.category && params.category !== 'ALL') {
    cleanParams.category = params.category;
  }
  if (params.deliveryArea && params.deliveryArea !== 'ALL') {
    cleanParams.deliveryArea = params.deliveryArea;
  }
  if (params.maxMoq && params.maxMoq !== 'ALL') {
    cleanParams.maxMoq = params.maxMoq;
  }
  if (params.dataSourceType && params.dataSourceType !== 'ALL') {
    cleanParams.dataSourceType = params.dataSourceType;
  }
  if (params.includeExpired !== undefined) {
    cleanParams.includeExpired = params.includeExpired;
  }
  if (params.page) cleanParams.page = params.page;
  if (params.limit) cleanParams.limit = params.limit;
  if (params.productId) cleanParams.productId = params.productId;

  return axiosClient.get('/offers/search', { params: cleanParams });
}

/**
 * Compares 2-4 candidate supplier offers deterministically and generates an AI trade-off summary.
 *
 * POST /api/offers/compare
 * Request body: { offerIds: string[], requestedQuantity?: number, deliveryArea?: string, requirementId?: string }
 *
 * @param {object} payload
 * @param {string[]} payload.offerIds
 * @param {number} [payload.requestedQuantity=100]
 * @param {string} [payload.deliveryArea='DELHI_NCR']
 * @param {string} [payload.requirementId]
 * @returns {Promise<{data: {statusCode: number, data: {comparison: object, summary: object}, message: string}}>}
 */
export async function compareOffers(payload) {
  return axiosClient.post('/offers/compare', payload);
}

/**
 * Lists registered suppliers with filtering.
 *
 * GET /api/suppliers
 * Supported query params: serviceArea, verificationStatus, activeStatus, dataSourceType, search, page, limit
 *
 * @param {object} [params={}]
 * @returns {Promise<{data: {statusCode: number, data: {suppliers: object[], pagination: object}, message: string}}>}
 */
export async function listSuppliers(params = {}) {
  return axiosClient.get('/suppliers', { params });
}

/**
 * Retrieves an individual supplier record by ID.
 *
 * GET /api/suppliers/:id
 *
 * @param {string} id
 * @returns {Promise<{data: {statusCode: number, data: object, message: string}}>}
 */
export async function getSupplierById(id) {
  return axiosClient.get(`/suppliers/${id}`);
}

/**
 * Searches product catalogue.
 *
 * GET /api/products/search
 * Supported query params: q, category, material, foodSafe, page, limit
 *
 * @param {object} [params={}]
 * @returns {Promise<{data: {statusCode: number, data: {products: object[], pagination: object}, message: string}}>}
 */
export async function searchProducts(params = {}) {
  return axiosClient.get('/products/search', { params });
}

// ─── Task SAH-09: Quote Request API ──────────────────────────────────────────

/**
 * Valid quote request reasons corresponding to backend Quote.model.js QUOTE_REQUEST_REASONS enum.
 */
export const QUOTE_REQUEST_REASONS = [
  { value: 'NO_COMPATIBLE_OFFER', label: 'No Compatible Offer Available' },
  { value: 'STALE_QUOTE', label: 'Stale / Expired Quote (Request Refresh)' },
  { value: 'CUSTOM_SPECS', label: 'Custom Specifications or Packaging' },
  { value: 'VOLUME_DISCOUNT', label: 'Volume Discount for Larger Order' },
  { value: 'UNDER_MOQ_POOL', label: 'Under-MOQ Fulfillment Request' },
  { value: 'OTHER', label: 'Other Commercial Requirement' },
];

/**
 * Requests a custom or revised quotation from a supplier.
 *
 * POST /api/quotes/requests
 *
 * @param {object} payload
 * @param {string} payload.supplierId - Valid Supplier ObjectId (required)
 * @param {string} payload.productId - Valid Product ObjectId (required)
 * @param {string} [payload.supplierOfferId] - Referenced SupplierOffer ObjectId (optional)
 * @param {string} [payload.requirementId] - Referenced Requirement ObjectId (optional)
 * @param {string} [payload.poolId] - Referenced GroupBuyPool ObjectId (optional)
 * @param {number} payload.requestedQuantity - Positive integer quantity (required)
 * @param {string} payload.deliveryArea - Target delivery region (required)
 * @param {string|Date} [payload.targetDeliveryDate] - Desired delivery date (optional)
 * @param {string} [payload.requestReason='NO_COMPATIBLE_OFFER'] - Reason enum (optional)
 * @param {string} [payload.requestNotes=''] - Additional instructions for supplier (optional)
 * @param {string} [payload.currency='INR'] - Currency code
 * @returns {Promise<{data: {statusCode: number, data: object, message: string}}>}
 */
export async function requestQuote(payload) {
  return axiosClient.post('/quotes/requests', payload);
}

/**
 * Fetches active wholesale offers for a specific supplier.
 *
 * Queries /api/offers/search with includeExpired: true and filters by supplierId.
 *
 * @param {string} supplierId
 * @param {object} [options={}]
 * @returns {Promise<{offers: object[], total: number}>}
 */
export async function getOffersBySupplier(supplierId, options = {}) {
  const res = await searchOffers({
    includeExpired: options.includeExpired !== undefined ? options.includeExpired : true,
    limit: options.limit || 100,
    ...options,
  });

  const payload = res?.data?.data !== undefined ? res.data.data : res?.data;
  const rawOffers = Array.isArray(payload?.offers)
    ? payload.offers
    : Array.isArray(payload)
    ? payload
    : [];

  const filtered = rawOffers.filter((o) => {
    const sId = o.supplierId?._id || o.supplierId?.id || o.supplierId;
    return String(sId) === String(supplierId);
  });

  return {
    offers: filtered,
    total: filtered.length,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalizes error messages from API or network failures.
 */
export function getApiErrorMessage(err, fallback = 'An unexpected error occurred while communicating with the supplier catalogue.') {
  if (!err) return fallback;
  if (err.response?.data?.message) return err.response.data.message;
  if (Array.isArray(err.errors) && err.errors.length > 0) return err.errors.join(', ');
  if (typeof err.message === 'string' && err.message) return err.message;
  return fallback;
}

/**
 * Checks if a supplier offer quote is expired.
 *
 * @param {object} offer
 * @returns {boolean}
 */
export function isOfferExpired(offer) {
  if (!offer?.expiresAt) return false;
  const expiryDate = new Date(offer.expiresAt);
  if (isNaN(expiryDate.getTime())) return false;
  return expiryDate.getTime() <= Date.now();
}

/**
 * Resolves the display provenance configuration for an offer or supplier.
 *
 * Follows strict SRS rule:
 * - Read real backend provenance fields.
 * - Do NOT label demo data as verified.
 * - Do NOT infer verification from presence of a supplier name.
 *
 * @param {object} offerOrSupplier
 * @returns {{ label: string, variant: string, isVerified: boolean, description: string }}
 */
export function resolveOfferProvenance(offerOrSupplier) {
  if (!offerOrSupplier) {
    return PROVENANCE_DISPLAY.UNKNOWN;
  }

  const rawSource = (offerOrSupplier.dataSourceType || '').toUpperCase().trim();
  const rawVerification = (offerOrSupplier.verificationStatus || '').toUpperCase().trim();

  // VERIFIED_LIVE: source must be VERIFIED_LIVE AND verification must be VERIFIED.
  // Do NOT infer verified from supplier name or any other field.
  if (rawSource === 'VERIFIED_LIVE' && rawVerification === 'VERIFIED') {
    return PROVENANCE_DISPLAY.VERIFIED_LIVE;
  }

  // SUPPLIER_SUBMITTED: supplier-uploaded quotes awaiting field verification.
  if (rawSource === 'SUPPLIER_SUBMITTED') {
    return PROVENANCE_DISPLAY.SUPPLIER_SUBMITTED;
  }

  // SEEDED_DEMO: explicit demo/seed provenance.
  if (rawSource === 'SEEDED_DEMO' || rawVerification === 'DEMO_SAMPLE') {
    return PROVENANCE_DISPLAY.SEEDED_DEMO;
  }

  // EXTERNAL_API: imported from external API — neutral, not demo, not verified.
  if (rawSource === 'EXTERNAL_API') {
    return PROVENANCE_DISPLAY.EXTERNAL_API;
  }

  // UNKNOWN / SCRAPED / anything else: neutral fallback — never label as verified.
  return PROVENANCE_DISPLAY.UNKNOWN;
}

/**
 * Computes an estimated landed cost in minor currency units (paise) for an offer.
 *
 * CRITICAL: When flatShippingCostMinor is null (shipping not yet quoted):
 * - Do NOT call the merchandise total a "landed cost".
 * - Return `isShippingKnown: false` so the UI can show "Shipping Quote Pending".
 * - `landedCostMinor` reflects merchandise + known shipping only.
 *   Do NOT use this for cross-offer ranking when isShippingKnown is false;
 *   use the backend's comparison endpoint for authoritative ranking instead.
 *
 * @param {object} offer
 * @param {number} [quantity=1]
 * @returns {{ unitPriceMinor, merchandiseTotalMinor, shippingCostMinor, landedCostMinor, isShippingKnown, isCompleteLandedCost }}
 */
export function calculateOfferLandedCost(offer, quantity = 1) {
  const qty = Math.max(1, Number(quantity) || 1);
  const basePriceMinor = Number(offer?.baseUnitPriceMinor || 0);

  // Check if quantity tier applies
  let appliedUnitMinor = basePriceMinor;
  if (Array.isArray(offer?.quantityTiers) && offer.quantityTiers.length > 0) {
    const sorted = [...offer.quantityTiers].sort((a, b) => b.minQuantity - a.minQuantity);
    for (const tier of sorted) {
      const minQ = Number(tier.minQuantity);
      const maxQ = tier.maxQuantity != null ? Number(tier.maxQuantity) : Infinity;
      if (qty >= minQ && qty <= maxQ) {
        appliedUnitMinor = Number(tier.unitPriceMinor);
        break;
      }
    }
  }

  const merchandiseTotalMinor = appliedUnitMinor * qty;
  // Shipping is known only when flatShippingCostMinor is a non-null number (including 0)
  const isShippingKnown =
    offer?.flatShippingCostMinor !== null &&
    offer?.flatShippingCostMinor !== undefined &&
    typeof offer.flatShippingCostMinor === 'number';
  const shippingCostMinor = isShippingKnown ? Number(offer.flatShippingCostMinor) : null;
  // landedCostMinor = merchandise + known shipping only.
  // isCompleteLandedCost tells callers whether this figure is a full landed cost.
  const landedCostMinor = merchandiseTotalMinor + (isShippingKnown ? shippingCostMinor : 0);

  return {
    unitPriceMinor: appliedUnitMinor,
    merchandiseTotalMinor,
    shippingCostMinor,
    landedCostMinor,
    isShippingKnown,
    // isCompleteLandedCost: true only when shipping is fully accounted for.
    // Use backend /api/offers/compare for authoritative cross-offer ranking.
    isCompleteLandedCost: isShippingKnown,
  };
}


/**
 * Retrieves authenticated supplier's own business profile.
 * GET /api/suppliers/me
 *
 * @returns {Promise<object>}
 */
export async function getMySupplierProfile() {
  const res = await axiosClient.get('/suppliers/me');
  const body = res?.data;
  if (body && typeof body === 'object' && 'data' in body) {
    return body.data;
  }
  return body;
}

/**
 * Updates authenticated supplier's own business profile.
 * PATCH /api/suppliers/me
 *
 * @param {object} payload
 * @returns {Promise<object>}
 */
export async function updateMySupplierProfile(payload) {
  const res = await axiosClient.patch('/suppliers/me', payload);
  const body = res?.data;
  if (body && typeof body === 'object' && 'data' in body) {
    return body.data;
  }
  return body;
}
