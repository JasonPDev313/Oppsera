/**
 * Authenticated HTTP request helpers for k6.
 *
 * Every request includes:
 *   - Authorization: Bearer <jwt>
 *   - Content-Type: application/json
 *   - X-Request-Id: <generated UUID>
 *   - X-Location-Id (from tenantAuth)
 *
 * Records cold start metrics from X-Cold-Start header.
 */

import http from 'k6/http';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
import { BASE_URL } from '../config/environments.js';
import { recordColdStart } from './metrics.js';

/**
 * Build request headers with auth + tracing.
 * @param {Object} tenantAuth - From auth.js getAuthForVU/getAuthForTenant
 * @param {Object} [extraHeaders] - Additional headers
 * @returns {Object} Headers object
 */
function buildHeaders(tenantAuth, extraHeaders = {}) {
  return Object.assign(
    {},
    tenantAuth.headers,
    {
      'X-Request-Id': uuidv4(),
    },
    extraHeaders
  );
}

/**
 * Process response for cold start tracking.
 * @param {Object} response - k6 http response
 */
function processResponse(response) {
  recordColdStart(response);
}

/**
 * Authenticated GET request.
 * @param {string} path - API path (e.g., '/api/v1/orders')
 * @param {Object} tenantAuth - From auth.js
 * @param {Object} [params] - k6 request params (tags, etc.)
 * @returns {Object} k6 http.Response
 */
export function authenticatedGet(path, tenantAuth, params = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = buildHeaders(tenantAuth);

  const response = http.get(url, {
    headers,
    tags: { endpoint: path.split('?')[0] },
    ...params,
  });

  processResponse(response);
  return response;
}

/**
 * Authenticated POST request.
 * @param {string} path - API path
 * @param {Object|string} body - Request body (will be JSON.stringified if object)
 * @param {Object} tenantAuth - From auth.js
 * @param {Object} [params] - k6 request params
 * @returns {Object} k6 http.Response
 */
export function authenticatedPost(path, body, tenantAuth, params = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = buildHeaders(tenantAuth);
  const payload = typeof body === 'string' ? body : JSON.stringify(body);

  const response = http.post(url, payload, {
    headers,
    tags: { endpoint: path.split('?')[0] },
    ...params,
  });

  processResponse(response);
  return response;
}

/**
 * Authenticated PATCH request.
 * @param {string} path - API path
 * @param {Object|string} body - Request body
 * @param {Object} tenantAuth - From auth.js
 * @param {Object} [params] - k6 request params
 * @returns {Object} k6 http.Response
 */
export function authenticatedPatch(path, body, tenantAuth, params = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = buildHeaders(tenantAuth);
  const payload = typeof body === 'string' ? body : JSON.stringify(body);

  const response = http.patch(url, payload, {
    headers,
    tags: { endpoint: path.split('?')[0] },
    ...params,
  });

  processResponse(response);
  return response;
}

/**
 * Authenticated DELETE request.
 * @param {string} path - API path
 * @param {Object} tenantAuth - From auth.js
 * @param {Object} [params] - k6 request params
 * @returns {Object} k6 http.Response
 */
export function authenticatedDelete(path, tenantAuth, params = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = buildHeaders(tenantAuth);

  const response = http.del(url, null, {
    headers,
    tags: { endpoint: path.split('?')[0] },
    ...params,
  });

  processResponse(response);
  return response;
}

/**
 * Unauthenticated GET (health checks, public endpoints).
 * @param {string} path - API path
 * @returns {Object} k6 http.Response
 */
export function publicGet(path) {
  const url = `${BASE_URL}${path}`;
  return http.get(url, {
    headers: { 'X-Request-Id': uuidv4() },
    tags: { endpoint: path },
  });
}

/**
 * Generate a unique clientRequestId for idempotent operations.
 * @param {string} prefix - Operation prefix (e.g., 'order', 'tender')
 * @returns {string} Unique ID like "k6_order_abc123"
 */
export function generateClientRequestId(prefix = 'k6') {
  return `${prefix}_${uuidv4().replace(/-/g, '').substring(0, 16)}`;
}
