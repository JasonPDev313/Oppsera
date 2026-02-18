/**
 * 05 — Bulk Import Under Load
 *
 * Large item creation + POS simultaneously. Validates async job system.
 * Key metrics: import throughput >500 rows/sec, POS for OTHER tenants unaffected.
 *
 * Profiles: nightly, release
 */

import { check, sleep } from 'k6';
import { buildThresholds } from '../config/thresholds.js';
import { getAuthForTenant, getAuthForVU, getAllTenantIndexes } from '../config/auth.js';
import { authenticatedGet, authenticatedPost, authenticatedPatch, generateClientRequestId } from '../helpers/api.js';
import { assertIsolation } from '../helpers/assertions.js';
import { recordEndpointMetric } from '../helpers/metrics.js';
import { posTerminalScan, posTerminalCustomer } from '../helpers/think-time.js';
import { getItemPool, pickAvailableItem, getRegisterId } from '../helpers/mutation-safety.js';
import { getBusinessDate } from '../helpers/data.js';
import { Counter, Trend } from 'k6/metrics';

const bulkImportDuration = new Trend('bulk_import_duration', true);
const bulkImportCount = new Counter('bulk_import_rows');

export const options = {
  scenarios: {
    // Foreground: POS for OTHER tenants (not the importing tenant)
    pos_foreground: {
      executor: 'constant-vus',
      vus: 30,
      duration: '10m',
      exec: 'posCheckout',
    },
    // Bulk import: Tenant 1 creates many items
    bulk_import: {
      executor: 'constant-vus',
      vus: 1,
      duration: '10m',
      startTime: '30s',
      exec: 'bulkItemCreation',
    },
  },
  thresholds: {
    ...buildThresholds(['pos_item_lookup', 'pos_order_creation']),
    http_req_failed: ['rate<0.02'], // <2% errors (imports may hit unique constraints)
  },
};

export function posCheckout() {
  // Assign VUs to tenants 2+ (NOT tenant 1 which is importing)
  const tenantIndex = ((__VU % 9) + 2); // tenants 2-10
  const auth = getAuthForTenant(Math.min(tenantIndex, 10));
  const allTenants = getAllTenantIndexes();
  const itemPool = getItemPool(auth.tenantIndex, __VU);
  const registerId = getRegisterId(auth.tenantIndex, __VU);

  const item = pickAvailableItem(itemPool);
  const lookupRes = authenticatedGet(`/api/v1/catalog/items/${item.catalogItemId}`, auth);
  recordEndpointMetric('pos_item_lookup', lookupRes);
  posTerminalScan();

  const orderRes = authenticatedPost('/api/v1/orders', {
    clientRequestId: generateClientRequestId('bulk_pos'),
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

export function bulkItemCreation() {
  // Tenant 1 creates items in batches
  const auth = getAuthForTenant(1, 'owner');
  const batchSize = 10;
  const batches = 50; // 500 items total per iteration

  for (let batch = 0; batch < batches; batch++) {
    for (let i = 0; i < batchSize; i++) {
      const itemNum = (__ITER * batches * batchSize) + (batch * batchSize) + i;
      const sku = `T01_BULK_${String(itemNum).padStart(6, '0')}`;

      const start = Date.now();
      const res = authenticatedPost('/api/v1/catalog/items', {
        clientRequestId: generateClientRequestId('bulk'),
        name: `Bulk Import Item ${itemNum}`,
        sku,
        itemType: 'retail',
        defaultPrice: (Math.random() * 50 + 1).toFixed(2),
      }, auth);

      if (res.status === 201) {
        bulkImportCount.add(1);
        bulkImportDuration.add(Date.now() - start);
      }
    }
    sleep(0.1); // Brief pause between batches
  }

  sleep(5); // Pause between full import rounds
}
