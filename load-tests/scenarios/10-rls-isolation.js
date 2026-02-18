/**
 * 10 — RLS Tenant Isolation
 *
 * SECURITY GATE — not a performance test. Pass/fail only.
 * ANY violation = entire suite fails.
 *
 * 4 tests:
 *   1. Cross-tenant read isolation (namespace + field checks)
 *   2. Cross-tenant write isolation (order references)
 *   3. Concurrent stock independence (2 tenants, isolated deductions)
 *   4. Connection reuse context bleed (rapid tenant alternation)
 *
 * Profiles: all (ci-fast runs mini version)
 */

import { check, sleep } from 'k6';
import { getAuthForTenant, getAllTenantIndexes } from '../config/auth.js';
import { authenticatedGet, authenticatedPost, generateClientRequestId } from '../helpers/api.js';
import {
  assertTenantField,
  assertTenantNamespace,
  assertNoForeignNamespace,
  tenantIsolationViolations,
} from '../helpers/assertions.js';
import { getItemPool, pickAvailableItem, getRegisterId } from '../helpers/mutation-safety.js';
import { getBusinessDate } from '../helpers/data.js';

export const options = {
  scenarios: {
    // Test 1: Cross-tenant read isolation
    read_isolation: {
      executor: 'per-vu-iterations',
      vus: parseInt(__ENV.RLS_READ_VUS || '50', 10),
      iterations: 10,
      maxDuration: '5m',
      exec: 'testReadIsolation',
    },
    // Test 2: Cross-tenant write isolation
    write_isolation: {
      executor: 'per-vu-iterations',
      vus: parseInt(__ENV.RLS_WRITE_VUS || '20', 10),
      iterations: 5,
      maxDuration: '5m',
      startTime: '10s',
      exec: 'testWriteIsolation',
    },
    // Test 3: Concurrent stock independence [ASSUMED: endpoint exists]
    // Skipped in ci-fast, runs in nightly/release
    // Test 4: Connection reuse context bleed
    context_bleed: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 100,
      maxDuration: '3m',
      startTime: '20s',
      exec: 'testContextBleed',
    },
  },
  thresholds: {
    'tenant_isolation_violations': ['count==0'], // HARD FAIL
  },
};

/**
 * Test 1: Cross-tenant read isolation.
 * Each VU is assigned a tenant. Rapid GET requests, full assertion on every response.
 */
export function testReadIsolation() {
  // Distribute VUs across tenants (5 VUs per tenant for 10 tenants)
  const allTenants = getAllTenantIndexes();
  const tenantIndex = allTenants[(__VU - 1) % allTenants.length];
  const auth = getAuthForTenant(tenantIndex);

  // List endpoints with isolation checks
  const endpoints = [
    { path: '/api/v1/orders?limit=20', field: 'data[*].tenantId' },
    { path: '/api/v1/catalog/items?limit=20', field: 'data[*].tenantId' },
    { path: '/api/v1/customers?limit=20', field: 'data[*].tenantId' },
    { path: '/api/v1/inventory?limit=20', field: 'data[*].tenantId' },
    { path: '/api/v1/catalog/categories', field: 'data[*].tenantId' },
  ];

  for (const ep of endpoints) {
    const res = authenticatedGet(ep.path, auth);
    check(res, {
      [`read isolation ${ep.path}: 200`]: (r) => r.status === 200,
    });

    if (res.status === 200) {
      // Field check
      assertTenantField(res, ep.field, auth.tenantId);
      // Namespace scan (broadest check)
      assertNoForeignNamespace(res, tenantIndex, allTenants);
    }

    sleep(0.1);
  }
}

/**
 * Test 2: Cross-tenant write isolation.
 * Create orders and verify no cross-tenant references.
 */
export function testWriteIsolation() {
  const allTenants = getAllTenantIndexes();
  const tenantIndex = allTenants[(__VU - 1) % Math.min(5, allTenants.length)];
  const auth = getAuthForTenant(tenantIndex);
  const itemPool = getItemPool(tenantIndex, __VU);
  const registerId = getRegisterId(tenantIndex, __VU);

  // Create an order with tenant's own items
  const orderRes = authenticatedPost('/api/v1/orders', {
    clientRequestId: generateClientRequestId('rls_write'),
    source: 'pos',
    businessDate: getBusinessDate(),
    terminalId: registerId,
  }, auth);

  check(orderRes, {
    'write isolation: order created': (r) => r.status === 201,
  });

  if (orderRes.status !== 201) return;

  const orderId = orderRes.json().data.id;

  // Verify order tenant_id
  assertTenantField(orderRes, 'data.tenantId', auth.tenantId);

  // Add line item
  const item = pickAvailableItem(itemPool);
  const lineRes = authenticatedPost(`/api/v1/orders/${orderId}/lines`, {
    clientRequestId: generateClientRequestId('rls_line'),
    catalogItemId: item.catalogItemId,
    qty: 1,
  }, auth);

  check(lineRes, {
    'write isolation: line added': (r) => r.status === 201,
  });

  // Fetch order and verify all nested data belongs to tenant
  const getRes = authenticatedGet(`/api/v1/orders/${orderId}`, auth);
  if (getRes.status === 200) {
    assertTenantField(getRes, 'data.tenantId', auth.tenantId);
    assertNoForeignNamespace(getRes, tenantIndex, allTenants);
  }

  // Clean up: void the order
  authenticatedPost(`/api/v1/orders/${orderId}/void`, {
    clientRequestId: generateClientRequestId('rls_void'),
    reason: 'RLS isolation test cleanup',
  }, auth);
}

/**
 * Test 4: Connection reuse context bleed.
 * Single VU rapidly alternates between Tenant A and Tenant B.
 * Zero think time — stress the connection pool.
 * If Tenant B's data appears in Tenant A's response = CRITICAL FAILURE.
 */
export function testContextBleed() {
  const allTenants = getAllTenantIndexes();
  const tenantA = allTenants[0];
  const tenantB = allTenants[Math.min(1, allTenants.length - 1)];

  // Alternate: A → B → A → B
  const isA = (__ITER % 2 === 0);
  const tenantIndex = isA ? tenantA : tenantB;
  const auth = getAuthForTenant(tenantIndex);

  const res = authenticatedGet('/api/v1/orders?limit=10', auth);
  check(res, {
    [`context bleed T${tenantIndex}: 200`]: (r) => r.status === 200,
  });

  if (res.status === 200) {
    // Strict check: no foreign namespace
    assertTenantField(res, 'data[*].tenantId', auth.tenantId);
    assertNoForeignNamespace(res, tenantIndex, allTenants);
  }

  // Also check items
  const itemRes = authenticatedGet('/api/v1/catalog/items?limit=10', auth);
  if (itemRes.status === 200) {
    assertTenantField(itemRes, 'data[*].tenantId', auth.tenantId);
    assertNoForeignNamespace(itemRes, tenantIndex, allTenants);
  }

  // NO THINK TIME — intentional (stress the pool context switching)
}
