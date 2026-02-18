/**
 * 07 — Connection Stress Test
 *
 * SYNTHETIC TEST — finds connection pool breaking point.
 * NO think time (intentional — this is a stress test).
 *
 * Ramps 1→300 VUs over 15 minutes (or until errors).
 * Measures: VU count at first error, P95 vs VU count, connection high-water.
 *
 * Profile: release only
 */

import { check, sleep } from 'k6';
import { getAuthForVU, getAllTenantIndexes } from '../config/auth.js';
import { authenticatedGet, authenticatedPost, generateClientRequestId } from '../helpers/api.js';
import { assertIsolation } from '../helpers/assertions.js';
import { recordEndpointMetric } from '../helpers/metrics.js';
import { getItemPool, pickAvailableItem, getRegisterId } from '../helpers/mutation-safety.js';
import { getBusinessDate } from '../helpers/data.js';
import { Counter, Trend } from 'k6/metrics';

const connectionErrors = new Counter('connection_errors');
const requestsPerWindow = new Counter('requests_per_window');

export const options = {
  scenarios: {
    connection_stress: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '15m', target: 300 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    // Deliberately lenient — this test is about finding the breaking point
    'tenant_isolation_violations': ['count==0'],
    // We EXPECT errors at high VU counts — track them, don't fail
  },
};

export default function () {
  const auth = getAuthForVU(__VU);
  const allTenants = getAllTenantIndexes();
  const itemPool = getItemPool(auth.tenantIndex, __VU);
  const registerId = getRegisterId(auth.tenantIndex, __VU);

  // NO THINK TIME — intentional stress test

  // Rapid GET (catalog lookup)
  const item = pickAvailableItem(itemPool);
  const getRes = authenticatedGet(`/api/v1/catalog/items/${item.catalogItemId}`, auth);
  requestsPerWindow.add(1);

  if (getRes.status >= 500 || getRes.status === 0) {
    connectionErrors.add(1);
    // Log the VU count and error for post-analysis
    console.warn(`[STRESS] Error at VU=${__VU} iter=${__ITER}: status=${getRes.status}`);
    sleep(1); // Back off slightly on errors
    return;
  }
  recordEndpointMetric('pos_item_lookup', getRes);

  // Rapid POST (order creation)
  const orderRes = authenticatedPost('/api/v1/orders', {
    clientRequestId: generateClientRequestId('stress'),
    source: 'pos',
    businessDate: getBusinessDate(),
    terminalId: registerId,
  }, auth);
  requestsPerWindow.add(1);

  if (orderRes.status >= 500 || orderRes.status === 0) {
    connectionErrors.add(1);
    console.warn(`[STRESS] Order error at VU=${__VU}: status=${orderRes.status}`);
    sleep(1);
    return;
  }
  recordEndpointMetric('pos_order_creation', orderRes);
  assertIsolation(orderRes, auth, allTenants);

  // Void immediately (cleanup)
  if (orderRes.status === 201) {
    const orderId = orderRes.json().data.id;
    authenticatedPost(`/api/v1/orders/${orderId}/void`, {
      clientRequestId: generateClientRequestId('void'),
      reason: 'Stress test cleanup',
    }, auth);
  }
}
