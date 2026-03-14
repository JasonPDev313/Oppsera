'use strict';

// KDS Smoke Test
// Usage: TEST_TOKEN=<jwt> TEST_LOCATION_ID=<locId> node scripts/kds-smoke.cjs
// Optional: BASE_URL=http://localhost:3000 (default)

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TEST_TOKEN = process.env.TEST_TOKEN;
const TEST_LOCATION_ID = process.env.TEST_LOCATION_ID;

const DIVIDER = '══════════════════════════════════';
const TIMEOUT_MS = 10_000;

// ── Env validation ──────────────────────────────────────────────────

if (!TEST_TOKEN || !TEST_LOCATION_ID) {
  console.error('Missing required environment variables.\n');
  console.error('Usage:');
  console.error('  TEST_TOKEN=<jwt> TEST_LOCATION_ID=<locationId> node scripts/kds-smoke.cjs');
  console.error('\nOptional:');
  console.error('  BASE_URL=http://localhost:3000   (default: http://localhost:3000)');
  process.exit(1);
}

// ── Helpers ─────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10);
}

function pass(msg) {
  console.log(`  \u2713 ${msg}`);
}

function fail(msg) {
  console.error(`  \u2717 ${msg}`);
}

async function apiFetch(path) {
  const url = `${BASE_URL}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'X-Location-Id': TEST_LOCATION_ID,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error(`Request timed out after ${TIMEOUT_MS / 1000}s: ${url}`);
    }
    throw new Error(`Network error fetching ${url}: ${err.message}`);
  }
  clearTimeout(timer);

  if (!res.ok) {
    let body = '';
    try { body = await res.text(); } catch { /* ignore */ }
    throw new Error(`HTTP ${res.status} from ${url}${body ? ` — ${body.slice(0, 200)}` : ''}`);
  }

  return res.json();
}

function assertShape(label, obj, keys) {
  for (const key of keys) {
    if (!(key in obj)) {
      throw new Error(`${label}: missing field "${key}" in response`);
    }
  }
}

// ── Checks ──────────────────────────────────────────────────────────

async function checkStations() {
  const data = await apiFetch(`/api/v1/fnb/stations?locationId=${TEST_LOCATION_ID}`);

  if (!data || !Array.isArray(data.data)) {
    throw new Error('Stations response missing data array');
  }

  const stations = data.data;
  const prepStations = stations.filter((s) => s.stationType !== 'expo');
  const expoStations = stations.filter((s) => s.stationType === 'expo');

  if (prepStations.length === 0) {
    throw new Error(`No prep stations found for location ${TEST_LOCATION_ID}`);
  }

  pass(
    `Fetched ${stations.length} station${stations.length !== 1 ? 's' : ''} ` +
    `(${prepStations.length} prep, ${expoStations.length} expo)`,
  );

  return { prepStations, expoStations };
}

async function checkKdsView(station) {
  const data = await apiFetch(
    `/api/v1/fnb/stations/${station.id}/kds?businessDate=${today()}`,
  );

  if (!data || typeof data.data !== 'object' || data.data === null) {
    throw new Error('KDS view response missing data object');
  }

  const view = data.data;
  assertShape('KDS view', view, ['stationId', 'tickets', 'activeTicketCount']);

  if (!Array.isArray(view.tickets)) {
    throw new Error('KDS view: tickets is not an array');
  }

  const stationLabel = station.displayName || station.name || station.id;
  pass(
    `KDS view for "${stationLabel}" — ${view.tickets.length} active ticket${view.tickets.length !== 1 ? 's' : ''}`,
  );

  return view;
}

async function checkTicketStructure(view) {
  if (view.tickets.length === 0) {
    pass('No active tickets — skipping ticket structure check');
    return;
  }

  const ticket = view.tickets[0];
  assertShape('Ticket', ticket, ['ticketId', 'items', 'alertLevel']);

  if (!Array.isArray(ticket.items)) {
    throw new Error(`Ticket ${ticket.ticketId}: items is not an array`);
  }

  const validAlertLevels = ['normal', 'warning', 'critical'];
  if (!validAlertLevels.includes(ticket.alertLevel)) {
    throw new Error(
      `Ticket ${ticket.ticketId}: alertLevel "${ticket.alertLevel}" is not one of ${validAlertLevels.join(', ')}`,
    );
  }

  const ticketLabel = ticket.ticketNumber != null ? `#${ticket.ticketNumber}` : ticket.ticketId.slice(0, 8);
  pass(
    `Ticket ${ticketLabel}: ${ticket.items.length} item${ticket.items.length !== 1 ? 's' : ''}, alert=${ticket.alertLevel}`,
  );
}

async function checkExpoView() {
  const data = await apiFetch(
    `/api/v1/fnb/stations/expo?locationId=${TEST_LOCATION_ID}&businessDate=${today()}`,
  );

  if (!data || typeof data.data !== 'object' || data.data === null) {
    throw new Error('Expo view response missing data object');
  }

  const view = data.data;
  assertShape('Expo view', view, ['tickets', 'totalActiveTickets']);

  if (!Array.isArray(view.tickets)) {
    throw new Error('Expo view: tickets is not an array');
  }

  pass(
    `Expo view — ${view.tickets.length} ready ticket${view.tickets.length !== 1 ? 's' : ''}`,
  );
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log('\nKDS Smoke Test');
  console.log(DIVIDER);

  let passed = 0;
  let failed = 0;

  async function run(label, fn) {
    try {
      await fn();
      passed++;
    } catch (err) {
      fail(`${label}: ${err.message}`);
      failed++;
    }
  }

  // Step 1: stations
  let prepStations = [];
  let expoStations = [];
  try {
    const result = await checkStations();
    prepStations = result.prepStations;
    expoStations = result.expoStations;
    passed++;
  } catch (err) {
    fail(`Fetch stations: ${err.message}`);
    failed++;
    // Without stations we cannot continue
    console.log(DIVIDER);
    console.error(`\nFailed — ${failed} check${failed !== 1 ? 's' : ''} failed\n`);
    process.exit(1);
  }

  // Step 2: KDS view for first prep station
  const firstPrep = prepStations[0];
  let kdsView = null;
  try {
    kdsView = await checkKdsView(firstPrep);
    passed++;
  } catch (err) {
    fail(`KDS view: ${err.message}`);
    failed++;
  }

  // Step 3: ticket structure (only if we got a view)
  if (kdsView !== null) {
    await run('Ticket structure', () => checkTicketStructure(kdsView));
  } else {
    fail('Ticket structure: skipped (KDS view unavailable)');
    failed++;
  }

  // Step 4: expo view (always attempt — expo is a fixed route, no station ID required)
  await run('Expo view', checkExpoView);

  console.log(DIVIDER);

  if (failed === 0) {
    console.log(`\nAll checks passed (${passed}/${passed})\n`);
    process.exit(0);
  } else {
    console.error(`\nFailed — ${failed} check${failed !== 1 ? 's' : ''} failed (${passed} passed)\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nUnexpected error:', err.message);
  process.exit(1);
});
