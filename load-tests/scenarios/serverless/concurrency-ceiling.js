/**
 * Serverless Concurrency Ceiling Test
 *
 * Finds the breaking point where Vercel starts returning 429/502/503.
 * Ramps VUs until error rate exceeds threshold.
 *
 * Key metrics:
 *   - Max sustainable VUs before errors
 *   - Error rate at each VU level
 *   - Connection pool exhaustion indicators
 *
 * Usage: k6 run scenarios/serverless/concurrency-ceiling.js -e TARGET_ENV=staging
 */

import { check, sleep } from 'k6';
import { getAuthForVU, getAllTenantIndexes } from '../../config/auth.js';
import { authenticatedGet, authenticatedPost, generateClientRequestId } from '../../helpers/api.js';
import { assertIsolation } from '../../helpers/assertions.js';
import { getItemPool, pickAvailableItem, getRegisterId } from '../../helpers/mutation-safety.js';
import { getBusinessDate } from '../../helpers/data.js';
import { Trend, Counter, Rate } from 'k6/metrics';

const requestDuration = new Trend('ceiling_request_duration', true);
const errorCount = new Counter('ceiling_errors');
const errorRate = new Rate('ceiling_error_rate');
const concurrencyLevel = new Trend('ceiling_concurrency_level');

export const options = {
  scenarios: {
    // Ramp concurrency: 10 → 50 → 100 → 150 → 200 → 250 → 300
    ramp_concurrency: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 10 },    // Warm up
        { duration: '3m', target: 50 },    // Moderate
        { duration: '3m', target: 100 },   // High
        { duration: '3m', target: 150 },   // Very high
        { duration: '3m', target: 200 },   // Stress
        { duration: '3m', target: 250 },   // Extreme
        { duration: '3m', target: 300 },   // Breaking point
        { duration: '2m', target: 50 },    // Recovery check
      ],
      exec: 'mixedLoad',
    },
  },
  thresholds: {
    // No hard failures — we're measuring the ceiling
    'ceiling_error_rate': ['rate<0.50'], // Abort if >50% errors
    'tenant_isolation_violations': ['count==0'], // Always enforce
  },
};

export function mixedLoad() {
  const auth = getAuthForVU(__VU);
  const allTenants = getAllTenantIndexes();

  // Track VU count as a metric
  concurrencyLevel.add(__VU);

  // 70% reads, 30% writes
  const isWrite = Math.random() < 0.3;

  if (isWrite) {
    // Write: create order
    const itemPool = getItemPool(auth.tenantIndex, __VU);
    const registerId = getRegisterId(auth.tenantIndex, __VU);
    const item = pickAvailableItem(itemPool);

    const orderRes = authenticatedPost('/api/v1/orders', {
      clientRequestId: generateClientRequestId('ceiling'),
      source: 'pos',
      businessDate: getBusinessDate(),
      terminalId: registerId,
    }, auth);

    requestDuration.add(orderRes.timings.duration);

    if (orderRes.status >= 400) {
      errorCount.add(1);
      errorRate.add(1);
      if (orderRes.status === 429 || orderRes.status >= 500) {
        console.warn(`⚠️ VU ${__VU}: ${orderRes.status} on POST /orders (iter ${__ITER})`);
      }
    } else {
      errorRate.add(0);
      assertIsolation(orderRes, auth, allTenants);

      if (orderRes.status === 201) {
        const orderId = orderRes.json().data.id;
        authenticatedPost(`/api/v1/orders/${orderId}/lines`, {
          clientRequestId: generateClientRequestId('line'),
          catalogItemId: item.catalogItemId,
          qty: 1,
        }, auth);
      }
    }
  } else {
    // Read: list endpoints
    const endpoints = [
      '/api/v1/catalog/items?limit=10',
      '/api/v1/orders?limit=10',
      '/api/v1/customers?limit=10',
    ];
    const path = endpoints[__ITER % endpoints.length];

    const res = authenticatedGet(path, auth);
    requestDuration.add(res.timings.duration);

    if (res.status >= 400) {
      errorCount.add(1);
      errorRate.add(1);
      if (res.status === 429 || res.status >= 500) {
        console.warn(`⚠️ VU ${__VU}: ${res.status} on GET ${path} (iter ${__ITER})`);
      }
    } else {
      errorRate.add(0);
    }
  }

  // Minimal think time (realistic API client)
  sleep(0.5);
}
