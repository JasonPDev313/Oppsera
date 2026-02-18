/**
 * 03 — Lunch Rush
 *
 * Sustained peak POS load across multiple tenants, 30 min.
 * Workload mix: 70% POS, 15% order history, 10% customer search, 5% stock check.
 *
 * Profiles: nightly, release
 */

import { check, sleep } from 'k6';
import { buildThresholds } from '../config/thresholds.js';
import { getAuthForVU, getAllTenantIndexes } from '../config/auth.js';
import { authenticatedGet, authenticatedPost, generateClientRequestId } from '../helpers/api.js';
import { assertIsolation } from '../helpers/assertions.js';
import { recordEndpointMetric } from '../helpers/metrics.js';
import { posTerminalScan, posTerminalCustomer, managerBrowse } from '../helpers/think-time.js';
import { getItemPool, pickAvailableItem, getRegisterId, seededRandom } from '../helpers/mutation-safety.js';
import { weightedRandom, getBusinessDate, getRandomCustomerId, getRandomOrderId, getSearchQuery } from '../helpers/data.js';

export const options = {
  scenarios: {
    lunch_rush: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5m', target: 100 },   // Opening rush
        { duration: '20m', target: 100 },  // Sustained lunch
        { duration: '5m', target: 20 },    // Winding down
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: buildThresholds([
    'pos_item_lookup',
    'pos_order_creation',
    'order_history_list',
    'customer_search',
  ]),
};

const WORKLOAD = [
  { item: 'pos_checkout', weight: 70 },
  { item: 'order_history', weight: 15 },
  { item: 'customer_search', weight: 10 },
  { item: 'stock_check', weight: 5 },
];

export default function () {
  const auth = getAuthForVU(__VU);
  const allTenants = getAllTenantIndexes();
  const action = weightedRandom(WORKLOAD);

  switch (action) {
    case 'pos_checkout':
      doPosCheckout(auth, allTenants);
      break;
    case 'order_history':
      doOrderHistory(auth, allTenants);
      break;
    case 'customer_search':
      doCustomerSearch(auth, allTenants);
      break;
    case 'stock_check':
      doStockCheck(auth, allTenants);
      break;
  }
}

function doPosCheckout(auth, allTenants) {
  const itemPool = getItemPool(auth.tenantIndex, __VU);
  const registerId = getRegisterId(auth.tenantIndex, __VU);
  const rng = seededRandom(__VU, __ITER);
  const itemCount = rng.nextInt(1, 4);
  const items = [];

  for (let i = 0; i < itemCount; i++) {
    const item = pickAvailableItem(itemPool);
    const res = authenticatedGet(`/api/v1/catalog/items/${item.catalogItemId}`, auth);
    recordEndpointMetric('pos_item_lookup', res);
    if (res.status === 200) items.push(item);
    posTerminalScan();
  }

  if (items.length === 0) { posTerminalCustomer(); return; }

  const orderRes = authenticatedPost('/api/v1/orders', {
    clientRequestId: generateClientRequestId('rush'),
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
      sleep(0.1);
    }

    const placeRes = authenticatedPost(`/api/v1/orders/${orderId}/place`, {
      clientRequestId: generateClientRequestId('place'),
    }, auth);

    if (placeRes.status === 200) {
      const total = placeRes.json().data?.total || 0;
      if (total > 0) {
        authenticatedPost(`/api/v1/orders/${orderId}/tenders`, {
          clientRequestId: generateClientRequestId('tender'),
          orderId,
          tenderType: 'cash',
          amountGiven: total,
          terminalId: registerId,
          employeeId: auth.userId,
          businessDate: getBusinessDate(),
        }, auth);
      }
    }
  }

  posTerminalCustomer();
}

function doOrderHistory(auth, allTenants) {
  const res = authenticatedGet('/api/v1/orders?limit=20', auth);
  check(res, { 'order history: 200': (r) => r.status === 200 });
  recordEndpointMetric('order_history_list', res);
  assertIsolation(res, auth, allTenants);

  // Drill into a specific order
  const orderId = getRandomOrderId(auth.tenantIndex);
  if (orderId) {
    const detailRes = authenticatedGet(`/api/v1/orders/${orderId}`, auth);
    check(detailRes, { 'order detail: 200': (r) => r.status === 200 });
    assertIsolation(detailRes, auth, allTenants);
  }

  managerBrowse();
}

function doCustomerSearch(auth, allTenants) {
  const query = getSearchQuery(auth.tenantIndex);
  const res = authenticatedGet(`/api/v1/customers/search?search=${encodeURIComponent(query)}`, auth);
  check(res, { 'customer search: 200': (r) => r.status === 200 });
  recordEndpointMetric('customer_search', res);
  assertIsolation(res, auth, allTenants);
  managerBrowse();
}

function doStockCheck(auth, allTenants) {
  const res = authenticatedGet('/api/v1/inventory?limit=20&lowStockOnly=true', auth);
  check(res, { 'stock check: 200': (r) => r.status === 200 });
  recordEndpointMetric('pos_stock_check', res);
  assertIsolation(res, auth, allTenants);
  sleep(2);
}
