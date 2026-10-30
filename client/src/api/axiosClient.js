/**
 * CoBuy AI — Centralized API Client (HIM-02)
 *
 * Implements an Axios-compatible HTTP client conforming to the backend's
 * security contracts:
 *  - Centralized base URL configuration (VITE_API_BASE_URL or auto-detected default)
 *  - Automatic URL normalization preventing duplicate /api prefixes
 *  - Automatic JWT Bearer token attachment via Authorization header
 *  - Automatic X-Correlation-Id UUID generation for request tracing (SRU-09)
 *  - withCredentials support for secure HTTP-only cookie authentication (PRK-03)
 *  - Normalized error handling preserving backend status codes and validation details
 *  - Request & response interceptors with leak-safe handlers
 */

const TOKEN_STORAGE_KEY = 'cobuy_token';

let inMemoryToken = null;

/**
 * Persist or clear authentication token in memory and localStorage.
 * Does not store passwords or unnecessary credentials.
 */
export function setAuthToken(token) {
  inMemoryToken = token || null;
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Gracefully handle environments with restricted localStorage
  }
}

/**
 * Retrieve current authentication token.
 */
export function getAuthToken() {
  if (inMemoryToken) {
    return inMemoryToken;
  }
  try {
    const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (stored) {
      inMemoryToken = stored;
      return stored;
    }
  } catch {
    // Restricted localStorage fallback
  }
  return null;
}

/**
 * Clear authentication token.
 */
export function clearAuthToken() {
  setAuthToken(null);
}

/**
 * Resolve base URL from environment or standard development defaults.
 */
function resolveBaseUrl() {
  const envUrl = typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL;
  if (envUrl) {
    const clean = envUrl.replace(/\/+$/, '');
    return clean.endsWith('/api') ? clean : `${clean}/api`;
  }

  if (typeof window !== 'undefined' && window.location?.hostname === 'localhost') {
    return 'http://localhost:8000/api';
  }

  return '/api';
}

/**
 * Concatenate baseURL and path without duplicate slashes or duplicate /api prefixes.
 */
export function buildUrl(baseURL, path) {
  if (!path) return baseURL;
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const cleanBase = (baseURL || '').replace(/\/+$/, '');
  let cleanPath = path.startsWith('/') ? path : `/${path}`;

  // Prevent duplicate /api if both base URL and path contain it
  if (cleanBase.endsWith('/api') && cleanPath.startsWith('/api/')) {
    cleanPath = cleanPath.substring(4);
  } else if (cleanBase.endsWith('/api') && cleanPath === '/api') {
    cleanPath = '';
  }

  return `${cleanBase}${cleanPath}`;
}

/**
 * Generate a UUIDv4-compliant correlation ID.
 */
function generateCorrelationId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `cobuy-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

class InterceptorManager {
  constructor() {
    this.handlers = [];
  }

  use(fulfilled, rejected) {
    this.handlers.push({ fulfilled, rejected });
    return this.handlers.length - 1;
  }

  eject(id) {
    if (this.handlers[id]) {
      this.handlers[id] = null;
    }
  }

  forEach(fn) {
    this.handlers.forEach((h) => {
      if (h !== null) {
        fn(h);
      }
    });
  }
}

class AxiosClient {
  constructor(defaults = {}) {
    this.defaults = {
      baseURL: resolveBaseUrl(),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      withCredentials: true,
      timeout: 30000,
      ...defaults,
    };

    this.interceptors = {
      request: new InterceptorManager(),
      response: new InterceptorManager(),
    };
  }

  async request(config) {
    let mergedConfig = {
      ...this.defaults,
      ...config,
      headers: {
        ...this.defaults.headers,
        ...(config.headers || {}),
      },
    };

    // Auto-attach correlation ID if missing
    if (!mergedConfig.headers['X-Correlation-Id'] && !mergedConfig.headers['x-correlation-id']) {
      mergedConfig.headers['X-Correlation-Id'] = generateCorrelationId();
    }

    // Auto-attach Bearer token if present and not explicitly overridden
    const token = getAuthToken();
    if (token && !mergedConfig.headers['Authorization'] && !mergedConfig.headers['authorization']) {
      mergedConfig.headers['Authorization'] = `Bearer ${token}`;
    }

    // Execute request interceptors chain
    for (const handler of this.interceptors.request.handlers) {
      if (handler && typeof handler.fulfilled === 'function') {
        mergedConfig = await handler.fulfilled(mergedConfig);
      }
    }

    let fullUrl = buildUrl(mergedConfig.baseURL, mergedConfig.url);
    const method = (mergedConfig.method || 'GET').toUpperCase();

    const fetchOptions = {
      method,
      headers: mergedConfig.headers,
      credentials: mergedConfig.withCredentials ? 'include' : 'same-origin',
    };

    if (mergedConfig.data !== undefined && method !== 'GET' && method !== 'HEAD') {
      if (typeof mergedConfig.data === 'string' || mergedConfig.data instanceof FormData) {
        fetchOptions.body = mergedConfig.data;
        if (mergedConfig.data instanceof FormData) {
          delete fetchOptions.headers['Content-Type'];
        }
      } else {
        fetchOptions.body = JSON.stringify(mergedConfig.data);
      }
    }

    if (mergedConfig.params) {
      const searchParams = new URLSearchParams();
      Object.entries(mergedConfig.params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
          searchParams.append(key, String(val));
        }
      });
      const queryStr = searchParams.toString();
      if (queryStr) {
        const separator = fullUrl.includes('?') ? '&' : '?';
        fullUrl += `${separator}${queryStr}`;
      }
    }

    let rawResponse;
    try {
      rawResponse = await fetch(fullUrl, fetchOptions);
    } catch (networkErr) {
      const error = new Error(networkErr.message || 'Network connection failed. Please check your network.');
      error.isAxiosError = true;
      error.isNetworkError = true;
      error.config = mergedConfig;
      error.errors = [error.message];

      // Run through response error interceptors
      for (const handler of this.interceptors.response.handlers) {
        if (handler && typeof handler.rejected === 'function') {
          return handler.rejected(error);
        }
      }
      throw error;
    }

    // Parse response body
    let responseData = null;
    const contentType = rawResponse.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        responseData = await rawResponse.json();
      } catch {
        responseData = null;
      }
    } else {
      try {
        responseData = await rawResponse.text();
      } catch {
        responseData = null;
      }
    }

    const headersObj = {};
    rawResponse.headers.forEach((val, key) => {
      headersObj[key] = val;
    });

    const response = {
      data: responseData,
      status: rawResponse.status,
      statusText: rawResponse.statusText,
      headers: headersObj,
      config: mergedConfig,
    };

    if (!rawResponse.ok) {
      // Backend returned 4xx or 5xx
      const backendMessage = responseData?.message || rawResponse.statusText || 'Request failed';
      const error = new Error(backendMessage);
      error.isAxiosError = true;
      error.status = rawResponse.status;
      error.statusCode = rawResponse.status;
      error.response = response;
      error.config = mergedConfig;
      error.errors = Array.isArray(responseData?.errors)
        ? responseData.errors
        : [backendMessage];

      for (const handler of this.interceptors.response.handlers) {
        if (handler && typeof handler.rejected === 'function') {
          return handler.rejected(error);
        }
      }
      throw error;
    }

    let finalResponse = response;
    for (const handler of this.interceptors.response.handlers) {
      if (handler && typeof handler.fulfilled === 'function') {
        finalResponse = await handler.fulfilled(finalResponse);
      }
    }

    return finalResponse;
  }

  get(url, config = {}) {
    return this.request({ ...config, method: 'GET', url });
  }

  delete(url, config = {}) {
    return this.request({ ...config, method: 'DELETE', url });
  }

  head(url, config = {}) {
    return this.request({ ...config, method: 'HEAD', url });
  }

  options(url, config = {}) {
    return this.request({ ...config, method: 'OPTIONS', url });
  }

  post(url, data, config = {}) {
    return this.request({ ...config, method: 'POST', url, data });
  }

  put(url, data, config = {}) {
    return this.request({ ...config, method: 'PUT', url, data });
  }

  patch(url, data, config = {}) {
    return this.request({ ...config, method: 'PATCH', url, data });
  }

  create(defaults = {}) {
    return new AxiosClient({ ...this.defaults, ...defaults });
  }
}

export const axiosClient = new AxiosClient();
export default axiosClient;
