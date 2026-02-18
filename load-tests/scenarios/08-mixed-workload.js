/**
 * 08 — Mixed Realistic Workload
 *
 * Most realistic simulation. Compressed business day (30 min).
 * Workload distribution matches real-world usage patterns.
 *
 * Profiles: nightly, release
 */

import { check, sleep } from 'k6';
import { buildThresholds } from '../config/thresholds.js';
import { getAuthForVU, getAllTenantIndexes } from '../config/auth.js';
import { authenticatedGet, authenticatedPost, authenticatedPatch, generateClientRequestId } from '../helpers/api.js';
import { assertIsolation } from '../helpers/assertions.js';
import { recordEndpointMetric } from '../helpers/metrics.js';
import { posTerminalScan, posTerminalCustomer, managerBrowse, managerReport, dashboardRefresh } from '../helpers/think-time.js';
import { getItemPool, pickAvailableItem, getRegisterId, seededRandom } from '../helpers/mutation-safety.js';
import { weightedRandom, getBusinessDate, getRandomCustomerId, getRandomOrderId, getSearchQuery, getRandomItem } from '../helpers/data.js';

export const options = {
  scenarios: {
    mixed: {
      executor: 'ramping-vus',
      startVUs: 0,
      // Compressed business day: morning → lunch → afternoon → dinner → close
      stages: [
        { duration: '5m', target: 6 },     // morning (20% peak)
        { duration: '5m', target: 15 },    // mid-morning (50%)
        { duration: '8m', target: 30 },    // lunch rush (100%)
        { duration: '5m', target: 18 },    // afternoon (60%)
        { duration: '4m', target: 27 },    // dinner rush (90%)
        { duration: '3m', target: 9 },     // closing (30%)
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: buildThresholds([
    'pos_item_lookup',
    'pos_order_creation',
    'order_history_list',
    'customer_search',
    'dashboard_aggregation',
    'settings_read',
  ]),
};

const WORKLOAD = [
  { item: 'pos_checkout', weight: 40 },
  { item: 'order_history', weight: 15 },
  { item: 'customer_search', weight: 10 },
  { item: 'catalog_browse', weight: 10 },
  { item: 'dashboard', weight: 8 },
  { item: 'settings_read', weight: 5 },
  { item: 'stock_check', weight: 5 },
  { item: 'item_update', weight: 3 },
  { item: 'customer_create', weight: 2 },
  { item: 'report_trigger', weight: 2 },
];

export default function () {
  const auth = getAuthForVU(__VU);
  const allTenants = getAllTenantIndexes();
  const action = weightedRandom(WORKLOAD);

  switch (action) {
    case 'pos_checkout': doPosCheckout(auth, allTenants); break;
    case 'order_history': doOrderHistory(auth, allTenants); break;
    case 'customer_search': doCustomerSearch(auth, allTenants); break;
    case 'catalog_browse': doCatalogBrowse(auth, allTenants); break;
    case 'dashboard': doDashboard(auth, allTenants); break;
    case 'settings_read': doSettingsRead(auth, allTenants); break;
    case 'stock_check': doStockCheck(auth, allTenants); break;
    case 'item_update': doItemUpdate(auth, allTenants); break;
    case 'customer_create': doCustomerCreate(auth, allTenants); break;
    case 'report_trigger': doReportTrigger(auth, allTenants); break;
  }
}

function doPosCheckout(auth, allTenants) {
  const itemPool = getItemPool(auth.tenantIndex, __VU);
  const registerId = getRegisterId(auth.tenantIndex, __VU);
  const rng = seededRandom(__VU, __ITER);
  const items = [];

  for (let i = 0; i < rng.nextInt(1, 4); i++) {
    const item = pickAvailableItem(itemPool);
    const res = authenticatedGet(`/api/v1/catalog/items/${item.catalogItemId}`, auth);
    recordEndpointMetric('pos_item_lookup', res);
    if (res.status === 200) items.push(item);
    posTerminalScan();
  }

  if (items.length > 0) {
    const orderRes = authenticatedPost('/api/v1/orders', {
      clientRequestId: generateClientRequestId('mixed_pos'),
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

function doOrderHistory(auth, allTenants) {
  const res = authenticatedGet('/api/v1/orders?limit=20', auth);
  recordEndpointMetric('order_history_list', res);
  assertIsolation(res, auth, allTenants);
  managerBrowse();
}

function doCustomerSearch(auth, allTenants) {
  const query = getSearchQuery(auth.tenantIndex);
  const res = authenticatedGet(`/api/v1/customers/search?search=${encodeURIComponent(query)}`, auth);
  recordEndpointMetric('customer_search', res);
  assertIsolation(res, auth, allTenants);
  managerBrowse();
}

function doCatalogBrowse(auth, allTenants) {
  // Browse categories then items
  const catRes = authenticatedGet('/api/v1/catalog/categories', auth);
  assertIsolation(catRes, auth, allTenants);
  sleep(1);

  const itemsRes = authenticatedGet('/api/v1/catalog/items?limit=20', auth);
  recordEndpointMetric('pos_item_lookup', itemsRes);
  assertIsolation(itemsRes, auth, allTenants);
  managerBrowse();
}

function doDashboard(auth, allTenants) {
  const endpoints = [
    '/api/v1/orders?limit=10&status=placed',
    '/api/v1/inventory?lowStockOnly=true&limit=10',
    '/api/v1/customers?limit=10',
  ];
  for (const ep of endpoints) {
    const res = authenticatedGet(ep, auth);
    recordEndpointMetric('dashboard_aggregation', res);
    assertIsolation(res, auth, allTenants);
    sleep(0.5);
  }
  dashboardRefresh();
}

function doSettingsRead(auth, _allTenants) {
  const res = authenticatedGet('/api/v1/me/permissions', auth);
  recordEndpointMetric('settings_read', res);
  check(res, { 'settings: 200': (r) => r.status === 200 });
  managerBrowse();
}

function doStockCheck(auth, allTenants) {
  const res = authenticatedGet('/api/v1/inventory?limit=20', auth);
  recordEndpointMetric('pos_stock_check', res);
  assertIsolation(res, auth, allTenants);
  sleep(2);
}

function doItemUpdate(auth, allTenants) {
  const item = getRandomItem(auth.tenantIndex);
  if (!item) { managerBrowse(); return; }

  const res = authenticatedPatch(`/api/v1/catalog/items/${item.catalogItemId}`, {
    name: `${item.name} (updated)`,
  }, auth);
  check(res, { 'item update: 200': (r) => r.status === 200 });
  managerBrowse();
}

function doCustomerCreate(auth, allTenants) {
  const pad = String(auth.tenantIndex).padStart(2, '0');
  const num = Math.floor(Math.random() * 100000);
  const res = authenticatedPost('/api/v1/customers', {
    clientRequestId: generateClientRequestId('cust'),
    type: 'person',
    firstName: `LoadTest`,
    lastName: `Customer ${num}`,
    email: `loadtest_${num}@tenant_${pad}.test`,
  }, auth);
  check(res, { 'customer create: 201': (r) => r.status === 201 });
  assertIsolation(res, auth, allTenants);
  managerBrowse();
}

function doReportTrigger(auth, allTenants) {
  // Simulate heavy read queries
  authenticatedGet('/api/v1/orders?limit=100', auth);
  authenticatedGet('/api/v1/customers?limit=100', auth);
  authenticatedGet('/api/v1/inventory?limit=100', auth);
  managerReport();
}
