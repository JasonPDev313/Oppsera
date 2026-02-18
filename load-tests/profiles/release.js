/**
 * release profile — Full suite at Stage 2 volume + soak (2-4 hours).
 * Runs before production releases.
 *
 * Scenarios: ALL including soak and connection-stress.
 * Seed profile: stage2-lite (re-seeded before run)
 *
 * Usage: k6 run profiles/release.js -e TARGET_ENV=staging
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
  dashboardRefresh,
} from '../helpers/think-time.js';
import { getItemPool, pickAvailableItem, getRegisterId, seededRandom } from '../helpers/mutation-safety.js';
import { weightedRandom, getBusinessDate, getRandomOrderId, getSearchQuery } from '../helpers/data.js';
import { Trend, Counter } from 'k6/metrics';

const largeTenantDuration = new Trend('large_tenant_order_duration', true);
const smallTenantDuration = new Trend('small_tenant_order_duration', true);
const connectionErrors = new Counter('connection_errors');

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

    // ── Phase 2: POS Checkout at Scale (18 min) ──
    pos_checkout: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5m', target: 100 },
        { duration: '10m', target: 100 },
        { duration: '3m', target: 0 },
      ],
      startTime: '30s',
      exec: 'posCheckout',
    },

    // ── Phase 3: Lunch Rush (30 min) ──
    lunch_rush: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5m', target: 100 },
        { duration: '20m', target: 100 },
        { duration: '5m', target: 20 },
      ],
      startTime: '19m',
      exec: 'lunchRush',
    },

    // ── Phase 4: Report Storm (15 min, overlaps with lunch) ──
    report_storm: {
      executor: 'constant-vus',
      vus: 10,
      duration: '15m',
      startTime: '30m',
      exec: 'reportStorm',
    },

    // ── Phase 5: Noisy Neighbor (15 min) ──
    noisy_large: {
      executor: 'constant-vus',
      vus: 80,
      duration: '15m',
      startTime: '50m',
      exec: 'noisyLarge',
    },
    noisy_small: {
      executor: 'constant-vus',
      vus: 20,
      duration: '15m',
      startTime: '50m',
      exec: 'noisySmall',
    },

    // ── Phase 6: Connection Stress (15 min) ──
    connection_stress: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '5m', target: 100 },
        { duration: '5m', target: 200 },
        { duration: '5m', target: 300 },
      ],
      startTime: '66m',
      exec: 'connectionStress',
    },

    // ── Phase 7: Mixed Workload (30 min) ──
    mixed_workload: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5m', target: 60 },
        { duration: '5m', target: 150 },
        { duration: '8m', target: 200 },
        { duration: '5m', target: 120 },
        { duration: '4m', target: 180 },
        { duration: '3m', target: 60 },
      ],
      startTime: '82m',
      exec: 'mixedWorkload',
    },

    // ── Phase 8: Soak (2 hours) ──
    soak: {
      executor: 'constant-vus',
      vus: parseInt(__ENV.SOAK_VUS || '75', 10),
      duration: __ENV.SOAK_DURATION || '2h',
      startTime: '112m',
      exec: 'soakTest',
    },

    // ── Phase 9: RLS Isolation (final gate) ──
    rls_read: {
      executor: 'per-vu-iterations',
      vus: 50,
      iterations: 10,
      maxDuration: '5m',
      startTime: '232m',
      exec: 'rlsRead',
    },
    rls_write: {
      executor: 'per-vu-iterations',
      vus: 20,
      iterations: 5,
      maxDuration: '5m',
      startTime: '232m',
      exec: 'rlsWrite',
    },
    rls_bleed: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 100,
      maxDuration: '3m',
      startTime: '232m',
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
    http_req_failed: ['rate<0.01'],               // <1% for release
    'small_tenant_order_duration': ['p(95)<250'],
    'tenant_isolation_violations': ['count==0'],   // HARD FAIL
  },
};

// ────────────────────────────────────────────────────────
// Shared Workload Distribution
// ────────────────────────────────────────────────────────

const MIXED_WORKLOAD = [
  { item: 'pos_checkout', weight: 40 },
  { item: 'order_history', weight: 15 },
  { item: 'customer_search', weight: 10 },
  { item: 'catalog_browse', weight: 10 },
  { item: 'dashboard', weight: 8 },
  { item: 'stock_check', weight: 5 },
  { item: 'settings', weight: 5 },
  { item: 'item_update', weight: 3 },
  { item: 'customer_crud', weight: 2 },
  { item: 'reports', weight: 2 },
];

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

  const scanCount = rng.nextInt(2, 5);
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
    clientRequestId: generateClientRequestId('rel_pos'),
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
    [1, 2, 3, 4, 5][__VU % 5],
    'manager',
  );

  authenticatedGet('/api/v1/orders?limit=50', auth);
  authenticatedGet('/api/v1/customers?limit=50', auth);
  authenticatedGet('/api/v1/inventory?limit=50', auth);
  authenticatedGet('/api/v1/catalog/items?limit=50', auth);
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

  if (__ITER % 3 === 0) {
    authenticatedGet('/api/v1/orders?limit=50', auth);
    authenticatedGet('/api/v1/customers?limit=50', auth);
  }

  posTerminalCustomer();
}

export function noisySmall() {
  const tenantIndex = [3, 5, 7, 8, 9][(__VU - 1) % 5];
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

export function connectionStress() {
  const auth = getAuthForVU(__VU);

  const res = authenticatedGet('/api/v1/catalog/items?limit=5', auth);
  if (res.status !== 200) {
    connectionErrors.add(1);
    console.warn(`Connection stress: VU ${__VU} got ${res.status} at iter ${__ITER}`);
  }
  // NO THINK TIME — intentional
}

export function mixedWorkload() {
  const auth = getAuthForVU(__VU);
  const allTenants = getAllTenantIndexes();
  const action = weightedRandom(MIXED_WORKLOAD);

  switch (action) {
    case 'pos_checkout': {
      const itemPool = getItemPool(auth.tenantIndex, __VU);
      const registerId = getRegisterId(auth.tenantIndex, __VU);
      const item = pickAvailableItem(itemPool);
      authenticatedGet(`/api/v1/catalog/items/${item.catalogItemId}`, auth);
      posTerminalScan();

      const orderRes = authenticatedPost('/api/v1/orders', {
        clientRequestId: generateClientRequestId('mixed'),
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
      break;
    }
    case 'order_history': {
      const res = authenticatedGet('/api/v1/orders?limit=20', auth);
      recordEndpointMetric('order_history_list', res);
      managerBrowse();
      break;
    }
    case 'customer_search': {
      const query = getSearchQuery(auth.tenantIndex);
      const res = authenticatedGet(`/api/v1/customers/search?search=${encodeURIComponent(query)}`, auth);
      recordEndpointMetric('customer_search', res);
      managerBrowse();
      break;
    }
    case 'catalog_browse': {
      authenticatedGet('/api/v1/catalog/categories', auth);
      authenticatedGet('/api/v1/catalog/items?limit=20', auth);
      managerBrowse();
      break;
    }
    case 'dashboard': {
      authenticatedGet('/api/v1/orders?limit=10&status=placed', auth);
      authenticatedGet('/api/v1/inventory?lowStockOnly=true&limit=10', auth);
      dashboardRefresh();
      break;
    }
    case 'stock_check': {
      authenticatedGet('/api/v1/inventory?limit=20', auth);
      sleep(2);
      break;
    }
    default: {
      authenticatedGet('/api/v1/orders?limit=50', auth);
      managerBrowse();
      break;
    }
  }
}

export function soakTest() {
  // Same as mixedWorkload but at steady state for 2h
  mixedWorkload();
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
    '/api/v1/catalog/categories',
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
    assertNoForeignNamespace(orderRes, tenantIndex, allTenants);
    const orderId = orderRes.json().data.id;
    authenticatedPost(`/api/v1/orders/${orderId}/void`, {
      clientRequestId: generateClientRequestId('rls_void'),
      reason: 'RLS release test cleanup',
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

  const itemRes = authenticatedGet('/api/v1/catalog/items?limit=10', auth);
  if (itemRes.status === 200) {
    assertTenantField(itemRes, 'data[*].tenantId', auth.tenantId);
    assertNoForeignNamespace(itemRes, tenantIndex, allTenants);
  }
  // NO THINK TIME — stress pool context switching
}
