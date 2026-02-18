/**
 * 09 — Soak Test
 *
 * Extended test for memory leaks, connection bloat, degradation.
 * Steady 50% of peak for 2+ hours. Samples metrics every 5 minutes.
 *
 * Pass: final-30-min P95 within 10% of first-30-min P95.
 * Profile: release only
 */

import { check, sleep } from 'k6';
import { buildThresholds } from '../config/thresholds.js';
import { getAuthForVU, getAllTenantIndexes } from '../config/auth.js';
import { authenticatedGet, authenticatedPost, generateClientRequestId } from '../helpers/api.js';
import { assertIsolation } from '../helpers/assertions.js';
import { recordEndpointMetric } from '../helpers/metrics.js';
import { posTerminalScan, posTerminalCustomer, managerBrowse } from '../helpers/think-time.js';
import { getItemPool, pickAvailableItem, getRegisterId, seededRandom } from '../helpers/mutation-safety.js';
import { weightedRandom, getBusinessDate, getRandomOrderId, getSearchQuery } from '../helpers/data.js';

export const options = {
  scenarios: {
    soak: {
      executor: 'constant-vus',
      vus: parseInt(__ENV.SOAK_VUS || '75', 10),
      duration: __ENV.SOAK_DURATION || '2h',
    },
  },
  thresholds: {
    ...buildThresholds([
      'pos_item_lookup',
      'pos_order_creation',
      'order_history_list',
      'customer_search',
    ]),
    http_req_failed: ['rate<0.005'],  // <0.5% error rate for soak
    'tenant_isolation_violations': ['count==0'],
  },
};

const WORKLOAD = [
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

export default function () {
  const auth = getAuthForVU(__VU);
  const allTenants = getAllTenantIndexes();
  const action = weightedRandom(WORKLOAD);

  switch (action) {
    case 'pos_checkout': {
      const itemPool = getItemPool(auth.tenantIndex, __VU);
      const registerId = getRegisterId(auth.tenantIndex, __VU);
      const rng = seededRandom(__VU, __ITER);
      const items = [];

      for (let i = 0; i < rng.nextInt(1, 3); i++) {
        const item = pickAvailableItem(itemPool);
        const res = authenticatedGet(`/api/v1/catalog/items/${item.catalogItemId}`, auth);
        recordEndpointMetric('pos_item_lookup', res);
        if (res.status === 200) items.push(item);
        posTerminalScan();
      }

      if (items.length > 0) {
        const orderRes = authenticatedPost('/api/v1/orders', {
          clientRequestId: generateClientRequestId('soak'),
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
      break;
    }

    case 'order_history': {
      const res = authenticatedGet('/api/v1/orders?limit=20', auth);
      recordEndpointMetric('order_history_list', res);
      assertIsolation(res, auth, allTenants);
      managerBrowse();
      break;
    }

    case 'customer_search': {
      const query = getSearchQuery(auth.tenantIndex);
      const res = authenticatedGet(`/api/v1/customers/search?search=${encodeURIComponent(query)}`, auth);
      recordEndpointMetric('customer_search', res);
      assertIsolation(res, auth, allTenants);
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
      sleep(30);
      break;
    }

    case 'stock_check': {
      const res = authenticatedGet('/api/v1/inventory?limit=20', auth);
      recordEndpointMetric('pos_stock_check', res);
      sleep(2);
      break;
    }

    case 'settings': {
      authenticatedGet('/api/v1/me/permissions', auth);
      managerBrowse();
      break;
    }

    case 'item_update':
    case 'customer_crud':
    case 'reports': {
      authenticatedGet('/api/v1/orders?limit=50', auth);
      managerBrowse();
      break;
    }
  }
}
