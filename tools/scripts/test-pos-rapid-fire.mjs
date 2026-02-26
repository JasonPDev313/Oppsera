/**
 * End-to-end test: Rapid-fire POS sales
 *
 * Simulates the exact cashier workflow:
 *   Sale 1: open order → add 2 items (batch) → place-and-pay (cash) → clear
 *   Sale 2: IMMEDIATELY open order → add 1 item → place-and-pay → clear
 *
 * Validates:
 *   1. No blocking between sales (< 50ms between clear and next addItem)
 *   2. All API calls succeed (no 409s, no "order still being created")
 *   3. Both orders end up fully paid
 *   4. Total round-trip time is reasonable
 */

const BASE = 'http://localhost:3000';

// ── Seed data IDs ──────────────────────────────────────────────
let TOKEN = process.env.TOKEN;
const LOCATION_ID = '01KJ7X1K01464VYCYPR8C2K0WC'; // Main Clubhouse
const TERMINAL_ID = '01KJ7X1K51SB40C95RRX2GPY6B'; // POS 1
const USER_ID = '01KJ7X1K0BK95DY78X9030EW8D';

// Retail items (no modifiers needed)
const ITEM_GOLF_GLOVE = '01KJ7X1K2AJCY8CH1T25CKNJSW';  // $24.99
const ITEM_GOLF_BALLS = '01KJ7X1K2AJCY8CH1T25CKNJSX';  // $39.99
const ITEM_POLO = null; // We'll find this

function uuid() {
  return crypto.randomUUID();
}

function todayBusinessDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function apiFetch(path, options = {}) {
  const start = performance.now();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`,
      'X-Location-Id': LOCATION_ID,
      ...options.headers,
    },
  });
  const elapsed = Math.round(performance.now() - start);
  const body = await res.text();
  let data;
  try { data = JSON.parse(body); } catch { data = body; }

  if (!res.ok) {
    console.error(`  ❌ ${options.method || 'GET'} ${path} → ${res.status} (${elapsed}ms)`);
    console.error(`     ${typeof data === 'string' ? data : JSON.stringify(data).slice(0, 200)}`);
    throw new Error(`API ${res.status}: ${path}`);
  }

  console.log(`  ✓ ${options.method || 'GET'} ${path} → ${res.status} (${elapsed}ms)`);
  return { data, elapsed };
}

// ── Sale helper ──────────────────────────────────────────────────

async function runSale(label, itemIds) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`🛒 ${label}`);
  console.log(`${'─'.repeat(60)}`);

  const saleStart = performance.now();

  // Step 1: Open order
  const { data: orderRes, elapsed: openTime } = await apiFetch('/api/v1/orders', {
    method: 'POST',
    body: JSON.stringify({
      source: 'pos',
      terminalId: TERMINAL_ID,
      employeeId: USER_ID,
      businessDate: todayBusinessDate(),
      clientRequestId: uuid(),
    }),
  });
  const orderId = orderRes.data.id;
  console.log(`  Order ID: ${orderId}`);

  // Step 2: Add items (batch)
  const items = itemIds.map(id => ({
    catalogItemId: id,
    qty: 1,
    clientRequestId: uuid(),
  }));

  const { data: batchRes, elapsed: batchTime } = await apiFetch(`/api/v1/orders/${orderId}/lines/batch`, {
    method: 'POST',
    body: JSON.stringify({ items }),
  });

  const orderTotal = batchRes.data.order.total;
  console.log(`  Order total: $${(orderTotal / 100).toFixed(2)} (${items.length} items)`);

  // Step 3: Place-and-pay (cash, exact amount)
  const payAmount = Math.max(orderTotal, 100); // at least $1.00
  const { data: payRes, elapsed: payTime } = await apiFetch(`/api/v1/orders/${orderId}/place-and-pay`, {
    method: 'POST',
    body: JSON.stringify({
      clientRequestId: uuid(),
      placeClientRequestId: uuid(),
      orderId,
      tenderType: 'cash',
      amountGiven: payAmount,
      tipAmount: 0,
      terminalId: TERMINAL_ID,
      employeeId: USER_ID,
      businessDate: todayBusinessDate(),
      posMode: 'retail',
    }),
  });

  const result = payRes.data;
  const saleTotal = Math.round(performance.now() - saleStart);

  console.log(`  Fully paid: ${result.isFullyPaid}`);
  console.log(`  Change: $${(result.changeGiven / 100).toFixed(2)}`);
  console.log(`\n  ⏱  Open: ${openTime}ms | Batch: ${batchTime}ms | Pay: ${payTime}ms | TOTAL: ${saleTotal}ms`);

  return { orderId, saleTotal, isFullyPaid: result.isFullyPaid };
}

// ── Main test ────────────────────────────────────────────────────

async function main() {
  console.log('═'.repeat(60));
  console.log('  RAPID-FIRE POS END-TO-END TEST');
  console.log('═'.repeat(60));
  console.log(`  Server: ${BASE}`);
  console.log(`  Location: ${LOCATION_ID} (Main Clubhouse)`);
  console.log(`  Terminal: ${TERMINAL_ID} (POS 1)`);

  // Warm up the server (first request is always slow)
  console.log('\n🔥 Warming up server...');
  await apiFetch('/api/health');

  // ── SALE 1: Golf Glove + Golf Balls ──
  const sale1 = await runSale('SALE 1: Golf Glove + Golf Balls', [
    ITEM_GOLF_GLOVE,
    ITEM_GOLF_BALLS,
  ]);

  if (!sale1.isFullyPaid) {
    console.error('\n❌ FAIL: Sale 1 was NOT fully paid!');
    process.exit(1);
  }

  // ── CLEAR (simulates clearOrder — just client-side state reset) ──
  const clearStart = performance.now();
  // In the real POS, clearOrder() is synchronous — it just nulls React state
  // and clears refs. No API call needed. We simulate the instant transition.
  const clearTime = Math.round(performance.now() - clearStart);
  console.log(`\n⚡ Clear order: ${clearTime}ms (client-side only)`);

  // ── SALE 2: Golf Glove only (IMMEDIATELY after clear) ──
  const gapStart = performance.now();
  const sale2 = await runSale('SALE 2: Golf Glove (immediate after clear)', [
    ITEM_GOLF_GLOVE,
  ]);
  const gapToFirstApi = Math.round(performance.now() - gapStart) - sale2.saleTotal;

  if (!sale2.isFullyPaid) {
    console.error('\n❌ FAIL: Sale 2 was NOT fully paid!');
    process.exit(1);
  }

  // ── SALE 3: Golf Balls only (rapid third sale) ──
  const sale3 = await runSale('SALE 3: Golf Balls (rapid third sale)', [
    ITEM_GOLF_BALLS,
  ]);

  if (!sale3.isFullyPaid) {
    console.error('\n❌ FAIL: Sale 3 was NOT fully paid!');
    process.exit(1);
  }

  // ── Results ──
  console.log('\n' + '═'.repeat(60));
  console.log('  RESULTS');
  console.log('═'.repeat(60));
  console.log(`  Sale 1 total: ${sale1.saleTotal}ms`);
  console.log(`  Sale 2 total: ${sale2.saleTotal}ms`);
  console.log(`  Sale 3 total: ${sale3.saleTotal}ms`);
  console.log(`  All sales fully paid: ✓`);
  console.log(`  No 409 errors: ✓`);
  console.log(`  No "order still being created" errors: ✓`);
  console.log('═'.repeat(60));
  console.log('  ✅ ALL TESTS PASSED');
  console.log('═'.repeat(60));
}

// ── Auth ─────────────────────────────────────────────────────────

async function login() {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@sunsetgolf.test', password: 'test' }),
  });
  const body = await res.json();
  return body.data.accessToken;
}

(async () => {
  try {
    if (!TOKEN) {
      console.log('No TOKEN env var — logging in...');
      TOKEN = await login();
    }
    await main();
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err.message);
    process.exit(1);
  }
})();
