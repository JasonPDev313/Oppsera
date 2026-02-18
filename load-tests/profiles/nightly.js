/**
 * nightly profile — Full suite at Stage 1 volume (30-60 min).
 * Runs via GitHub Actions on cron schedule.
 *
 * Scenarios: All except soak and connection-stress.
 * Seed profile: stage1 (verify before run, re-seed if stale)
 *
 * Usage: k6 run profiles/nightly.js -e TARGET_ENV=staging
 */

import { check, sleep } from 'k6';
import { BASE_URL } from '../config/environments.js';
import { buildThresholds } from '../config/thresholds.js';
import { getAuthForTenant, getAuthForVU, getAllTenantIndexes } from '../config/auth.js';
import { authenticatedGet, authenticatedPost, generateClientRequestId } from '../helpers/api.js';
import {
  assertIsolation,
  assertTenantField,
  assertNoForeignNamespace,
  tenantIsolationViolations,
} from '../helpers/assertions.js';
import { recordEndpointMetric } from '../helpers/metrics.js';
import {
  posTerminalScan,
  posTerminalCustomer,
  posTerminalPayment,
  managerBrowse,
  managerReport,
} from '../helpers/think-time.js';
import { getItemPool, pickAvailableItem, getRegisterId, seededRandom } from '../helpers/mutation-safety.js';
import { weightedRandom, getBusinessDate, getRandomOrderId, getSearchQuery } from '../helpers/data.js';
import { Trend } from 'k6/metrics';

const largeTenantDuration = new Trend('large_tenant_order_duration', true);
const smallTenantDuration = new Trend('small_tenant_order_duration', true);

export const options = {
  scenarios: {
    // ── Phase 1: Smoke (30s) ──
    smoke: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '30s',
      exec: 'smokeTest',
    },
    // ── Phase 2: POS Checkout (8 min) ──
    pos_checkout: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 15 },
        { duration: '5m', target: 15 },
        { duration: '1m', target: 0 },
      ],
      startTime: '30s',
      exec: 'posCheckout',
    },
    // ── Phase 3: Lunch Rush (15 min) ──
    lunch_rush: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '3m', target: 50 },
        { duration: '10m', target: 50 },
        { duration: '2m', target: 10 },
      ],
      startTime: '9m',
      exec: 'lunchRush',
    },
    // ── Phase 4: Report Storm (10 min, overlaps with lunch) ──
    report_storm: {
      executor: 'constant-vus',
      vus: 5,
      duration: '10m',
      startTime: '14m',
      exec: 'reportStorm',
    },
    // ── Phase 5: Noisy Neighbor (10 min) ──
    noisy_large: {
      executor: 'constant-vus',
      vus: 40,
      duration: '10m',
      startTime: '25m',
      exec: 'noisyLarge',
    },
    noisy_small: {
      executor: 'constant-vus',
      vus: 10,
      duration: '10m',
      startTime: '25m',
      exec: 'noisySmall',
    },
    // ── Phase 6: RLS Isolation (3 min) ──
    rls_read: {
      executor: 'per-vu-iterations',
      vus: 30,
      iterations: 5,
      maxDuration: '3m',
      startTime: '36m',
      exec: 'rlsRead',
    },
    rls_write: {
      executor: 'per-vu-iterations',
      vus: 10,
      iterations: 3,
      maxDuration: '3m',
      startTime: '36m',
      exec: 'rlsWrite',
    },
    rls_bleed: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 50,
      maxDuration: '2m',
      startTime: '36m',
      exec: 'rlsBleed',
    },
  },
  thresholds: {
    ...buildThresholds([
      'pos_item_lookup',
      'pos_order_creation',
      'order_history_list',
      'customer_search',
    ]),
    http_req_failed: ['rate<0.02'],
    'small_tenant_order_duration': ['p(95)<250'],
    'tenant_isolation_violations': ['count==0'],
  },
};

// ────────────────────────────────────────────────────────
// Scenario Functions
// ────────────────────────────────────────────────────────

export function smokeTest() {
  const auth = getAuthForTenant(1);
  check(authenticatedGet('/api/v1/catalog/items?limit=5', auth), {
    'smoke: items 200': (r) => r.status === 200,
  });
  check(authenticatedGet('/api/v1/orders?limit=5', auth), {
    'smoke: orders 200': (r) => r.status === 200,
  });
}

export function posCheckout() {
  const auth = getAuthForVU(__VU);
  const allTenants = getAllTenantIndexes();
  const itemPool = getItemPool(auth.tenantIndex, __VU);
  const registerId = getRegisterId(auth.tenantIndex, __VU);
  const rng = seededRandom(__VU, __ITER);

  // Scan 1-3 items
  const scanCount = rng.nextInt(1, 3);
  const items = [];
  for (let i = 0; i < scanCount; i++) {
    const item = pickAvailableItem(itemPool);
    const res = authenticatedGet(`/api/v1/catalog/items/${item.catalogItemId}`, auth);
    recordEndpointMetric('pos_item_lookup', res);
    if (res.status === 200) items.push(item);
    posTerminalScan();
  }

  if (items.length === 0) return;

  const orderRes = authenticatedPost('/api/v1/orders', {
    clientRequestId: generateClientRequestId('nightly_pos'),
    source: 'pos',
    businessDate: getBusinessDate(),
    terminalId: registerId,
  }, auth);
  recordEndpointMetric('pos_order_creation', orderRes);
  assertIsolation(orderRes, auth, allTenants);

  if (orderRes.status === 201) {
    const orderId = orderRes.json().data.id;
    for (const item of items) {
      authenticatedPost(`/api/v1/orders/${orderId}/lines`, {
        clientRequestId: generateClientRequestId('line'),
        catalogItemId: item.catalogItemId,
        qty: 1,
      }, auth);
    }
    authenticatedPost(`/api/v1/orders/${orderId}/place`, {
      clientRequestId: generateClientRequestId('place'),
    }, auth);
  }

  posTerminalCustomer();
}

export function lunchRush() {
  const auth = getAuthForVU(__VU);
  const allTenants = getAllTenantIndexes();
  const itemPool = getItemPool(auth.tenantIndex, __VU);
  const registerId = getRegisterId(auth.tenantIndex, __VU);

  const item = pickAvailableItem(itemPool);
  authenticatedGet(`/api/v1/catalog/items/${item.catalogItemId}`, auth);
  posTerminalScan();

  const orderRes = authenticatedPost('/api/v1/orders', {
    clientRequestId: generateClientRequestId('lunch'),
    source: 'pos',
    businessDate: getBusinessDate(),
    terminalId: registerId,
  }, auth);
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

export function reportStorm() {
  const auth = getAuthForTenant(
    [1, 2, 3][__VU % 3],
    'manager',
  );

  authenticatedGet('/api/v1/orders?limit=50', auth);
  authenticatedGet('/api/v1/customers?limit=50', auth);
  authenticatedGet('/api/v1/inventory?limit=50', auth);
  managerReport();
}

export function noisyLarge() {
  const auth = getAuthForTenant(1, 'cashier');
  const allTenants = getAllTenantIndexes();
  const itemPool = getItemPool(1, __VU);
  const registerId = getRegisterId(1, __VU);

  const item = pickAvailableItem(itemPool);
  authenticatedGet(`/api/v1/catalog/items/${item.catalogItemId}`, auth);
  posTerminalScan();

  const orderRes = authenticatedPost('/api/v1/orders', {
    clientRequestId: generateClientRequestId('noisy'),
    source: 'pos',
    businessDate: getBusinessDate(),
    terminalId: registerId,
  }, auth);
  assertIsolation(orderRes, auth, allTenants);

  if (orderRes.status === 201) {
    largeTenantDuration.add(orderRes.timings.duration);
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

  if (__ITER % 5 === 0) {
    authenticatedGet('/api/v1/orders?limit=50', auth);
  }

  posTerminalCustomer();
}

export function noisySmall() {
  const tenantIndex = [3, 5, 7, 8][(__VU - 1) % 4];
  const auth = getAuthForTenant(tenantIndex, 'cashier');
  const allTenants = getAllTenantIndexes();
  const itemPool = getItemPool(tenantIndex, __VU);
  const registerId = getRegisterId(tenantIndex, __VU);

  const item = pickAvailableItem(itemPool);
  authenticatedGet(`/api/v1/catalog/items/${item.catalogItemId}`, auth);
  posTerminalScan();

  const orderRes = authenticatedPost('/api/v1/orders', {
    clientRequestId: generateClientRequestId('small'),
    source: 'pos',
    businessDate: getBusinessDate(),
    terminalId: registerId,
  }, auth);
  assertIsolation(orderRes, auth, allTenants);

  if (orderRes.status === 201) {
    smallTenantDuration.add(orderRes.timings.duration);
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

export function rlsRead() {
  const allTenants = getAllTenantIndexes();
  const tenantIndex = allTenants[(__VU - 1) % allTenants.length];
  const auth = getAuthForTenant(tenantIndex);

  const endpoints = [
    '/api/v1/orders?limit=20',
    '/api/v1/catalog/items?limit=20',
    '/api/v1/customers?limit=20',
    '/api/v1/inventory?limit=20',
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

export function rlsWrite() {
  const allTenants = getAllTenantIndexes();
  const tenantIndex = allTenants[(__VU - 1) % Math.min(5, allTenants.length)];
  const auth = getAuthForTenant(tenantIndex);
  const registerId = getRegisterId(tenantIndex, __VU);

  const orderRes = authenticatedPost('/api/v1/orders', {
    clientRequestId: generateClientRequestId('rls_w'),
    source: 'pos',
    businessDate: getBusinessDate(),
    terminalId: registerId,
  }, auth);

  if (orderRes.status === 201) {
    assertTenantField(orderRes, 'data.tenantId', auth.tenantId);
    const orderId = orderRes.json().data.id;
    authenticatedPost(`/api/v1/orders/${orderId}/void`, {
      clientRequestId: generateClientRequestId('rls_void'),
      reason: 'RLS test cleanup',
    }, auth);
  }
}

export function rlsBleed() {
  const allTenants = getAllTenantIndexes();
  const tenantA = allTenants[0];
  const tenantB = allTenants[Math.min(1, allTenants.length - 1)];
  const tenantIndex = (__ITER % 2 === 0) ? tenantA : tenantB;
  const auth = getAuthForTenant(tenantIndex);

  const res = authenticatedGet('/api/v1/orders?limit=10', auth);
  if (res.status === 200) {
    assertTenantField(res, 'data[*].tenantId', auth.tenantId);
    assertNoForeignNamespace(res, tenantIndex, allTenants);
  }
  // NO THINK TIME — intentional
}
