/**
 * ci-fast profile — Quick validation (<5 min).
 * Runs on every staging deploy (Vercel preview).
 *
 * Scenarios: smoke + POS checkout (mini) + RLS isolation
 * Seed profile: stage1 (pre-seeded, not re-seeded)
 *
 * Usage: k6 run profiles/ci-fast.js -e TARGET_ENV=staging
 */

import { check, sleep } from 'k6';
import { BASE_URL } from '../config/environments.js';
import { buildThresholds } from '../config/thresholds.js';
import { getAuthForTenant, getAuthForVU, getAllTenantIndexes } from '../config/auth.js';
import { authenticatedGet, authenticatedPost, generateClientRequestId } from '../helpers/api.js';
import { assertIsolation, assertTenantField, assertNoForeignNamespace, tenantIsolationViolations } from '../helpers/assertions.js';
import { recordEndpointMetric } from '../helpers/metrics.js';
import { posTerminalScan, posTerminalCustomer } from '../helpers/think-time.js';
import { getItemPool, pickAvailableItem, getRegisterId } from '../helpers/mutation-safety.js';
import { getBusinessDate } from '../helpers/data.js';

export const options = {
  scenarios: {
    // Phase 1: Quick smoke test (30s)
    smoke: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '30s',
      exec: 'smokeTest',
    },
    // Phase 2: Mini POS checkout (5 VUs, 2 minutes)
    pos_checkout: {
      executor: 'constant-vus',
      vus: 5,
      duration: '2m',
      startTime: '30s',
      exec: 'posCheckout',
    },
    // Phase 3: RLS isolation gate (10 VUs, 1 minute)
    rls_isolation: {
      executor: 'per-vu-iterations',
      vus: 10,
      iterations: 5,
      maxDuration: '1m',
      startTime: '3m',
      exec: 'rlsGate',
    },
  },
  thresholds: {
    ...buildThresholds(['pos_item_lookup', 'pos_order_creation']),
    http_req_failed: ['rate<0.05'],             // <5% error rate
    http_req_duration: ['p(95)<500'],            // Generous for cold starts
    'tenant_isolation_violations': ['count==0'], // HARD FAIL
  },
};

/** Smoke: health + list + create/void cycle */
export function smokeTest() {
  const auth = getAuthForTenant(1);

  // Health check
  const healthRes = authenticatedGet('/api/v1/health', auth);
  check(healthRes, {
    'smoke: health 200': (r) => r.status === 200,
  });

  // List items
  const itemsRes = authenticatedGet('/api/v1/catalog/items?limit=5', auth);
  check(itemsRes, {
    'smoke: list items 200': (r) => r.status === 200,
  });

  // List orders
  const ordersRes = authenticatedGet('/api/v1/orders?limit=5', auth);
  check(ordersRes, {
    'smoke: list orders 200': (r) => r.status === 200,
  });

  // Create + void order
  const orderRes = authenticatedPost('/api/v1/orders', {
    clientRequestId: generateClientRequestId('ci_smoke'),
    source: 'pos',
    businessDate: getBusinessDate(),
  }, auth);

  check(orderRes, {
    'smoke: create order': (r) => r.status === 201,
  });

  if (orderRes.status === 201) {
    const orderId = orderRes.json().data.id;
    authenticatedPost(`/api/v1/orders/${orderId}/void`, {
      clientRequestId: generateClientRequestId('ci_void'),
      reason: 'CI smoke test cleanup',
    }, auth);
  }
}

/** Mini POS checkout: scan 1-2 items, create order */
export function posCheckout() {
  const auth = getAuthForVU(__VU);
  const allTenants = getAllTenantIndexes();
  const itemPool = getItemPool(auth.tenantIndex, __VU);
  const registerId = getRegisterId(auth.tenantIndex, __VU);

  const item = pickAvailableItem(itemPool);
  const lookupRes = authenticatedGet(`/api/v1/catalog/items/${item.catalogItemId}`, auth);
  recordEndpointMetric('pos_item_lookup', lookupRes);
  posTerminalScan();

  const orderRes = authenticatedPost('/api/v1/orders', {
    clientRequestId: generateClientRequestId('ci_pos'),
    source: 'pos',
    businessDate: getBusinessDate(),
    terminalId: registerId,
  }, auth);
  recordEndpointMetric('pos_order_creation', orderRes);
  assertIsolation(orderRes, auth, allTenants);

  if (orderRes.status === 201) {
    const orderId = orderRes.json().data.id;
    authenticatedPost(`/api/v1/orders/${orderId}/lines`, {
      clientRequestId: generateClientRequestId('line'),
      catalogItemId: item.catalogItemId,
      qty: 1,
    }, auth);
    authenticatedPost(`/api/v1/orders/${orderId}/place`, {
      clientRequestId: generateClientRequestId('place'),
    }, auth);
  }

  posTerminalCustomer();
}

/** RLS isolation gate: cross-tenant read checks */
export function rlsGate() {
  const allTenants = getAllTenantIndexes();
  const tenantIndex = allTenants[(__VU - 1) % allTenants.length];
  const auth = getAuthForTenant(tenantIndex);

  const endpoints = [
    '/api/v1/orders?limit=10',
    '/api/v1/catalog/items?limit=10',
    '/api/v1/customers?limit=10',
  ];

  for (const path of endpoints) {
    const res = authenticatedGet(path, auth);
    if (res.status === 200) {
      assertTenantField(res, 'data[*].tenantId', auth.tenantId);
      assertNoForeignNamespace(res, tenantIndex, allTenants);
    }
    sleep(0.1);
  }
}
