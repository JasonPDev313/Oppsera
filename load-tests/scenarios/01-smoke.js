/**
 * 01 — Smoke Test
 *
 * Quick sanity check: environment works, auth works, basic flows work.
 * Runs in ALL profiles (ci-fast, nightly, release).
 *
 * Flow: health check → auth → list items → list orders → create order → isolation check
 */

import { check, sleep } from 'k6';
import { buildThresholds } from '../config/thresholds.js';
import { getAuthForTenant, getAllTenantIndexes } from '../config/auth.js';
import { authenticatedGet, authenticatedPost, publicGet, generateClientRequestId } from '../helpers/api.js';
import { assertIsolation } from '../helpers/assertions.js';
import { getRandomItem, getBusinessDate } from '../helpers/data.js';

export const options = {
  scenarios: {
    smoke: {
      executor: 'constant-vus',
      vus: 1,
      duration: '30s',
    },
  },
  thresholds: {
    ...buildThresholds(['pos_item_lookup', 'pos_order_creation']),
    http_req_failed: ['rate==0'], // Zero errors for smoke
  },
};

export default function () {
  const auth = getAuthForTenant(1); // Always test with tenant 1
  const allTenants = getAllTenantIndexes();

  // 1. Health check (unauthenticated)
  const healthRes = publicGet('/api/v1/entitlements/modules');
  check(healthRes, {
    'health: status 200': (r) => r.status === 200,
    'health: has data': (r) => {
      try { return r.json().data !== undefined; } catch { return false; }
    },
  });
  sleep(0.5);

  // 2. List catalog items (authenticated)
  const itemsRes = authenticatedGet(
    `/api/v1/catalog/items?limit=10`,
    auth
  );
  check(itemsRes, {
    'items: status 200': (r) => r.status === 200,
    'items: has data array': (r) => {
      try { return Array.isArray(r.json().data); } catch { return false; }
    },
  });
  assertIsolation(itemsRes, auth, allTenants);
  sleep(0.5);

  // 3. List orders (authenticated)
  const ordersRes = authenticatedGet(
    `/api/v1/orders?limit=10`,
    auth
  );
  check(ordersRes, {
    'orders: status 200': (r) => r.status === 200,
    'orders: has data': (r) => {
      try { return r.json().data !== undefined; } catch { return false; }
    },
  });
  assertIsolation(ordersRes, auth, allTenants);
  sleep(0.5);

  // 4. Create an order (open → add line → place)
  const createRes = authenticatedPost(
    '/api/v1/orders',
    {
      clientRequestId: generateClientRequestId('smoke'),
      source: 'pos',
      businessDate: getBusinessDate(),
      terminalId: 'T01_REG_SMOKE',
    },
    auth
  );
  check(createRes, {
    'create order: status 201': (r) => r.status === 201,
    'create order: has id': (r) => {
      try { return !!r.json().data?.id; } catch { return false; }
    },
  });
  assertIsolation(createRes, auth, allTenants);

  if (createRes.status === 201) {
    const orderId = createRes.json().data.id;

    // Add a line item
    const item = getRandomItem(1);
    if (item) {
      const addLineRes = authenticatedPost(
        `/api/v1/orders/${orderId}/lines`,
        {
          clientRequestId: generateClientRequestId('smoke_line'),
          catalogItemId: item.catalogItemId,
          qty: 1,
        },
        auth
      );
      check(addLineRes, {
        'add line: status 201': (r) => r.status === 201,
      });
    }

    // Void the order (cleanup — don't leave orphan orders)
    const voidRes = authenticatedPost(
      `/api/v1/orders/${orderId}/void`,
      {
        clientRequestId: generateClientRequestId('smoke_void'),
        reason: 'Load test smoke cleanup',
      },
      auth
    );
    check(voidRes, {
      'void order: status 200': (r) => r.status === 200,
    });
  }

  sleep(1);

  // 5. Customer search
  const searchRes = authenticatedGet(
    `/api/v1/customers/search?search=Tenant01`,
    auth
  );
  check(searchRes, {
    'customer search: status 200': (r) => r.status === 200,
  });
  assertIsolation(searchRes, auth, allTenants);

  sleep(1);
}
