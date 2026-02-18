/**
 * Tenant isolation assertion helpers.
 *
 * Three layers of protection:
 * 1. Field check — verify tenant_id on response objects
 * 2. Namespace check — verify SKU/email/name prefixes match tenant
 * 3. Full body scan — scan response text for ANY other tenant's markers
 *
 * ANY violation increments the tenant_isolation_violations counter
 * and logs full details for post-mortem analysis.
 */

import { check } from 'k6';
import { Counter } from 'k6/metrics';

export const tenantIsolationViolations = new Counter('tenant_isolation_violations');
export const crossTenantNamespaceLeaks = new Counter('cross_tenant_namespace_leaks');

/**
 * Pad tenant index to 2 digits for namespace matching.
 * @param {number} tenantIndex
 * @returns {string} e.g., "01", "12"
 */
function padTenant(tenantIndex) {
  return String(tenantIndex).padStart(2, '0');
}

/**
 * Assert that a specific field path equals the expected tenant ID.
 * Supports dot notation: "data.tenantId", "data.orders[*].tenantId"
 *
 * @param {Object} response - k6 HTTP response
 * @param {string} fieldPath - Dot-notation path (e.g., "data.tenantId")
 * @param {string} expectedTenantId - Expected tenant ID value
 * @returns {boolean} Pass/fail
 */
export function assertTenantField(response, fieldPath, expectedTenantId) {
  let body;
  try {
    body = response.json();
  } catch (e) {
    return true; // Non-JSON response, skip
  }

  const values = extractFieldValues(body, fieldPath);

  for (const val of values) {
    if (val !== expectedTenantId) {
      tenantIsolationViolations.add(1);
      console.error(
        `[ISOLATION VIOLATION] Field check failed!\n` +
        `  Endpoint: ${response.url}\n` +
        `  Field: ${fieldPath}\n` +
        `  Expected: ${expectedTenantId}\n` +
        `  Found: ${val}`
      );
      return false;
    }
  }
  return true;
}

/**
 * Assert that values at a field path contain the tenant namespace marker.
 * e.g., all SKUs start with "T01_" for tenant index 1.
 *
 * @param {Object} response - k6 HTTP response
 * @param {string} fieldPath - Path to check (e.g., "data[*].sku")
 * @param {number} expectedTenantIndex - 1-based tenant index
 * @returns {boolean}
 */
export function assertTenantNamespace(response, fieldPath, expectedTenantIndex) {
  let body;
  try {
    body = response.json();
  } catch (e) {
    return true;
  }

  const prefix = `T${padTenant(expectedTenantIndex)}_`;
  const values = extractFieldValues(body, fieldPath);

  for (const val of values) {
    if (val && typeof val === 'string' && !val.startsWith(prefix)) {
      tenantIsolationViolations.add(1);
      crossTenantNamespaceLeaks.add(1);
      console.error(
        `[NAMESPACE VIOLATION] SKU/namespace mismatch!\n` +
        `  Endpoint: ${response.url}\n` +
        `  Field: ${fieldPath}\n` +
        `  Expected prefix: ${prefix}\n` +
        `  Found: ${val}`
      );
      return false;
    }
  }
  return true;
}

/**
 * Scan the full response body for ANY other tenant's namespace markers.
 * This is the broadest, most paranoid check.
 *
 * @param {Object} response - k6 HTTP response
 * @param {number} ownTenantIndex - This VU's tenant index
 * @param {number[]} allTenantIndexes - All tenant indexes in test
 * @returns {boolean}
 */
export function assertNoForeignNamespace(response, ownTenantIndex, allTenantIndexes) {
  const bodyText = response.body;
  if (!bodyText || typeof bodyText !== 'string') return true;

  const ownPrefix = `T${padTenant(ownTenantIndex)}_`;

  for (const idx of allTenantIndexes) {
    if (idx === ownTenantIndex) continue;

    const foreignPrefix = `T${padTenant(idx)}_`;
    if (bodyText.includes(foreignPrefix)) {
      tenantIsolationViolations.add(1);
      crossTenantNamespaceLeaks.add(1);
      console.error(
        `[CROSS-TENANT LEAK] Foreign namespace detected!\n` +
        `  Endpoint: ${response.url}\n` +
        `  Own tenant: T${padTenant(ownTenantIndex)}\n` +
        `  Foreign marker found: ${foreignPrefix}\n` +
        `  Body snippet: ${bodyText.substring(bodyText.indexOf(foreignPrefix) - 20, bodyText.indexOf(foreignPrefix) + 40)}`
      );
      return false;
    }

    // Also check email namespace: @tenant_XX.test
    const foreignEmail = `@tenant_${padTenant(idx)}.test`;
    if (bodyText.includes(foreignEmail)) {
      tenantIsolationViolations.add(1);
      crossTenantNamespaceLeaks.add(1);
      console.error(
        `[CROSS-TENANT LEAK] Foreign email namespace detected!\n` +
        `  Endpoint: ${response.url}\n` +
        `  Own tenant: T${padTenant(ownTenantIndex)}\n` +
        `  Foreign email marker: ${foreignEmail}`
      );
      return false;
    }
  }

  return true;
}

/**
 * Master isolation assertion — runs all applicable checks for an endpoint.
 *
 * @param {Object} response - k6 HTTP response
 * @param {Object} tenantAuth - From auth.js
 * @param {number[]} allTenantIndexes - All test tenant indexes
 * @param {Object} [spec] - Optional assertion spec override
 */
export function assertIsolation(response, tenantAuth, allTenantIndexes, spec) {
  if (response.status >= 400) return; // Don't assert on error responses

  // 1. Field check: tenant_id on response data
  assertTenantField(response, 'data.tenantId', tenantAuth.tenantId);

  // 2. Array field check (for list endpoints)
  assertTenantField(response, 'data[*].tenantId', tenantAuth.tenantId);

  // 3. Namespace check (SKU, email, orderNumber)
  assertTenantNamespace(response, 'data[*].sku', tenantAuth.tenantIndex);
  assertTenantNamespace(response, 'data.sku', tenantAuth.tenantIndex);

  // 4. Full body scan for foreign namespace markers
  assertNoForeignNamespace(response, tenantAuth.tenantIndex, allTenantIndexes);
}

/**
 * Quick check for list responses — verify all items belong to tenant.
 */
export function assertListIsolation(response, tenantAuth, allTenantIndexes) {
  check(response, {
    'status is 200': (r) => r.status === 200,
  });
  assertIsolation(response, tenantAuth, allTenantIndexes);
}

// --- Internal helpers ---

/**
 * Extract values from a nested object using a dot-notation path.
 * Supports [*] for array iteration.
 */
function extractFieldValues(obj, path) {
  if (!obj || !path) return [];

  const parts = path.split('.');
  let current = [obj];

  for (const part of parts) {
    const next = [];
    for (const item of current) {
      if (item === null || item === undefined) continue;

      if (part === '[*]' || part.endsWith('[*]')) {
        const key = part.replace('[*]', '');
        const target = key ? item[key] : item;
        if (Array.isArray(target)) {
          next.push(...target);
        }
      } else if (part.includes('[*]')) {
        // Handle "data[*]" mid-path
        const key = part.split('[')[0];
        const arr = item[key];
        if (Array.isArray(arr)) {
          next.push(...arr);
        }
      } else {
        if (item[part] !== undefined) {
          next.push(item[part]);
        }
      }
    }
    current = next;
  }

  return current;
}
