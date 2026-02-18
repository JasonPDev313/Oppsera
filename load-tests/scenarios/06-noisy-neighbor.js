/**
 * 06 — Noisy Neighbor
 *
 * One large tenant at max load, small tenants must not be affected.
 * Pass criteria: small tenant P95 within 20% of isolated baseline.
 *
 * Profiles: nightly, release
 */

import { check, sleep } from 'k6';
import { buildThresholds } from '../config/thresholds.js';
import { getAuthForTenant, getAllTenantIndexes } from '../config/auth.js';
import { authenticatedGet, authenticatedPost, generateClientRequestId } from '../helpers/api.js';
import { assertIsolation } from '../helpers/assertions.js';
import { recordEndpointMetric } from '../helpers/metrics.js';
import { posTerminalScan, posTerminalCustomer } from '../helpers/think-time.js';
import { getItemPool, pickAvailableItem, getRegisterId } from '../helpers/mutation-safety.js';
import { getBusinessDate } from '../helpers/data.js';
import { Trend } from 'k6/metrics';

// Per-tenant-size metrics to compare small vs large
const largeTenantDuration = new Trend('large_tenant_order_duration', true);
const smallTenantDuration = new Trend('small_tenant_order_duration', true);

export const options = {
  scenarios: {
    // Large tenant: 80 VUs — aggressive load
    large_tenant: {
      executor: 'constant-vus',
      vus: 80,
      duration: '10m',
      exec: 'largeTenantLoad',
    },
    // Small tenants: 5 VUs each × 4 tenants = 20 VUs
    small_tenant_8: {
      executor: 'constant-vus',
      vus: 5,
      duration: '10m',
      exec: 'smallTenantLoad',
      env: { TENANT_INDEX: '8' },
    },
    small_tenant_9: {
      executor: 'constant-vus',
      vus: 5,
      duration: '10m',
      exec: 'smallTenantLoad',
      env: { TENANT_INDEX: '9' },
    },
    small_tenant_10: {
      executor: 'constant-vus',
      vus: 5,
      duration: '10m',
      exec: 'smallTenantLoad',
      env: { TENANT_INDEX: '10' },
    },
    small_tenant_3: {
      executor: 'constant-vus',
      vus: 5,
      duration: '10m',
      exec: 'smallTenantLoad',
      env: { TENANT_INDEX: '3' },
    },
  },
  thresholds: {
    ...buildThresholds(['pos_item_lookup', 'pos_order_creation']),
    // Small tenants must stay fast even under large tenant pressure
    'small_tenant_order_duration': ['p(95)<250'], // 25% above baseline
    'tenant_isolation_violations': ['count==0'],
  },
};

export function largeTenantLoad() {
  const auth = getAuthForTenant(1, 'cashier'); // Tenant 1 = large
  const allTenants = getAllTenantIndexes();
  const itemPool = getItemPool(1, __VU);
  const registerId = getRegisterId(1, __VU);

  // Rapid POS + order history + catalog browsing
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

  // Also do report-style queries (extra DB pressure)
  if (__ITER % 5 === 0) {
    authenticatedGet('/api/v1/orders?limit=50', auth);
    authenticatedGet('/api/v1/customers?limit=50', auth);
  }

  posTerminalCustomer();
}

export function smallTenantLoad() {
  const tenantIndex = parseInt(__ENV.TENANT_INDEX || '8', 10);
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
