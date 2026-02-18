/**
 * 02 — POS Checkout Flow
 *
 * Simulates realistic POS terminal behavior — the most important test.
 * Each VU is a POS terminal: scan items, build cart, checkout, next customer.
 *
 * Load profiles:
 *   ci-fast:  5 VUs, 2 min
 *   nightly:  ramp 1→15 VUs over 2 min, hold 5 min, ramp down
 *   release:  ramp 1→150 VUs over 5 min, hold 10 min, ramp down
 */

import { check, sleep } from 'k6';
import { buildThresholds } from '../config/thresholds.js';
import { getAuthForVU, getAllTenantIndexes } from '../config/auth.js';
import { authenticatedGet, authenticatedPost, generateClientRequestId } from '../helpers/api.js';
import { assertIsolation } from '../helpers/assertions.js';
import { recordEndpointMetric } from '../helpers/metrics.js';
import { posTerminalScan, posTerminalCustomer, posTerminalPayment } from '../helpers/think-time.js';
import { getItemPool, pickAvailableItem, getRegisterId, seededRandom } from '../helpers/mutation-safety.js';
import { getBusinessDate, getRandomCustomerId } from '../helpers/data.js';

// Dynamic options based on profile (overridden by execution profile imports)
export const options = {
  scenarios: {
    pos_checkout: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: JSON.parse(__ENV.POS_STAGES || '[{"duration":"2m","target":15},{"duration":"5m","target":15},{"duration":"1m","target":0}]'),
      gracefulRampDown: '30s',
    },
  },
  thresholds: buildThresholds([
    'pos_item_lookup',
    'pos_stock_check',
    'pos_order_creation',
  ]),
};

export default function () {
  const auth = getAuthForVU(__VU);
  const allTenants = getAllTenantIndexes();
  const itemPool = getItemPool(auth.tenantIndex, __VU);
  const registerId = getRegisterId(auth.tenantIndex, __VU);
  const rng = seededRandom(__VU, __ITER);
  const usedItems = new Set();

  // Number of items to scan (2-5 per transaction)
  const itemCount = rng.nextInt(2, 5);
  const scannedItems = [];

  // --- Phase 1: Scan items (build cart) ---
  for (let i = 0; i < itemCount; i++) {
    const item = pickAvailableItem(itemPool, usedItems);
    usedItems.add(item.catalogItemId);

    // Item lookup (simulates barcode scan or catalog tap)
    const lookupRes = authenticatedGet(
      `/api/v1/catalog/items/${item.catalogItemId}`,
      auth
    );
    check(lookupRes, {
      'item lookup: 200': (r) => r.status === 200,
    });
    recordEndpointMetric('pos_item_lookup', lookupRes);
    assertIsolation(lookupRes, auth, allTenants);

    if (lookupRes.status === 200) {
      scannedItems.push(item);
    }

    posTerminalScan(); // 1-3s between scans
  }

  if (scannedItems.length === 0) {
    posTerminalCustomer();
    return; // Nothing to checkout
  }

  // --- Phase 2: Create order ---
  const customerId = rng.next() > 0.7 ? getRandomCustomerId(auth.tenantIndex) : undefined;

  const orderRes = authenticatedPost(
    '/api/v1/orders',
    {
      clientRequestId: generateClientRequestId('pos'),
      source: 'pos',
      businessDate: getBusinessDate(),
      terminalId: registerId,
      customerId: customerId || undefined,
    },
    auth
  );
  check(orderRes, {
    'create order: 201': (r) => r.status === 201,
  });
  recordEndpointMetric('pos_order_creation', orderRes);
  assertIsolation(orderRes, auth, allTenants);

  if (orderRes.status !== 201) {
    posTerminalCustomer();
    return;
  }

  const orderId = orderRes.json().data.id;

  // --- Phase 3: Add line items ---
  for (const item of scannedItems) {
    const addLineRes = authenticatedPost(
      `/api/v1/orders/${orderId}/lines`,
      {
        clientRequestId: generateClientRequestId('line'),
        catalogItemId: item.catalogItemId,
        qty: 1,
      },
      auth
    );
    check(addLineRes, {
      'add line: 201': (r) => r.status === 201,
    });

    sleep(0.2); // Slight delay between line additions
  }

  // --- Phase 4: Place order ---
  const placeRes = authenticatedPost(
    `/api/v1/orders/${orderId}/place`,
    {
      clientRequestId: generateClientRequestId('place'),
    },
    auth
  );
  check(placeRes, {
    'place order: 200': (r) => r.status === 200,
  });

  if (placeRes.status !== 200) {
    // Void if place failed
    authenticatedPost(`/api/v1/orders/${orderId}/void`, {
      clientRequestId: generateClientRequestId('void'),
      reason: 'Load test: place failed',
    }, auth);
    posTerminalCustomer();
    return;
  }

  // --- Phase 5: Record tender (cash payment) ---
  const orderData = placeRes.json().data;
  const total = orderData.total || 0;

  if (total > 0) {
    const tenderRes = authenticatedPost(
      `/api/v1/orders/${orderId}/tenders`,
      {
        clientRequestId: generateClientRequestId('tender'),
        orderId: orderId,
        tenderType: 'cash',
        amountGiven: total + (rng.next() > 0.5 ? rng.nextInt(0, 500) : 0), // Exact or overpay
        tipAmount: rng.next() > 0.8 ? rng.nextInt(100, 500) : 0,
        terminalId: registerId,
        employeeId: auth.userId,
        businessDate: getBusinessDate(),
      },
      auth
    );
    check(tenderRes, {
      'tender: 201': (r) => r.status === 201,
    });
  }

  // --- Phase 6: Between customers ---
  posTerminalPayment(); // 3-8s
  posTerminalCustomer(); // 5-15s
}
