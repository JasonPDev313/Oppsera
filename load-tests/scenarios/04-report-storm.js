/**
 * 04 — Report Storm
 *
 * Reports + POS simultaneously. Validates whether read replica is needed.
 * Key metric: POS latency DURING reports must not degrade >20% from baseline.
 *
 * Profiles: nightly, release
 */

import { check, sleep } from 'k6';
import { buildThresholds } from '../config/thresholds.js';
import { getAuthForTenant, getAuthForVU, getAllTenantIndexes } from '../config/auth.js';
import { authenticatedGet, authenticatedPost, generateClientRequestId } from '../helpers/api.js';
import { assertIsolation } from '../helpers/assertions.js';
import { recordEndpointMetric } from '../helpers/metrics.js';
import { posTerminalScan, posTerminalCustomer, dashboardRefresh } from '../helpers/think-time.js';
import { getItemPool, pickAvailableItem, getRegisterId } from '../helpers/mutation-safety.js';
import { getBusinessDate } from '../helpers/data.js';

export const options = {
  scenarios: {
    // Foreground: constant POS load
    pos_foreground: {
      executor: 'constant-vus',
      vus: 20,
      duration: '10m',
      exec: 'posCheckout',
    },
    // Background: periodic report requests
    report_background: {
      executor: 'constant-vus',
      vus: 5,
      duration: '10m',
      startTime: '1m', // Start after POS is warmed up
      exec: 'reportRequests',
    },
  },
  thresholds: {
    ...buildThresholds(['pos_item_lookup', 'pos_order_creation', 'dashboard_aggregation']),
    // POS during reports must not degrade significantly
    'pos_order_creation_duration': ['p(95)<250'], // 25% above normal 200ms target
  },
};

export function posCheckout() {
  const auth = getAuthForVU(__VU);
  const allTenants = getAllTenantIndexes();
  const itemPool = getItemPool(auth.tenantIndex, __VU);
  const registerId = getRegisterId(auth.tenantIndex, __VU);

  // Quick 2-item checkout
  const items = [];
  for (let i = 0; i < 2; i++) {
    const item = pickAvailableItem(itemPool);
    const res = authenticatedGet(`/api/v1/catalog/items/${item.catalogItemId}`, auth);
    recordEndpointMetric('pos_item_lookup', res);
    if (res.status === 200) items.push(item);
    posTerminalScan();
  }

  if (items.length > 0) {
    const orderRes = authenticatedPost('/api/v1/orders', {
      clientRequestId: generateClientRequestId('report_pos'),
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
  }

  posTerminalCustomer();
}

export function reportRequests() {
  // Cycle through tenants 1-5
  const tenantIndex = ((__ITER % 5) + 1);
  const auth = getAuthForTenant(tenantIndex, 'owner');
  const allTenants = getAllTenantIndexes();

  // Dashboard-style aggregation queries
  const endpoints = [
    '/api/v1/orders?limit=50&status=placed',
    '/api/v1/orders?limit=50&status=paid',
    '/api/v1/inventory?lowStockOnly=true&limit=50',
    '/api/v1/customers?limit=50',
    '/api/v1/billing/accounts?limit=20',
  ];

  for (const endpoint of endpoints) {
    const res = authenticatedGet(endpoint, auth);
    check(res, {
      [`report ${endpoint.split('?')[0]}: 200`]: (r) => r.status === 200,
    });
    recordEndpointMetric('dashboard_aggregation', res);
    assertIsolation(res, auth, allTenants);
    sleep(2); // Brief pause between report queries
  }

  dashboardRefresh(); // 30-60s between report cycles
}
