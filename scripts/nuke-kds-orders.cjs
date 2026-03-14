#!/usr/bin/env node
/**
 * Nuke ALL KDS orders/tickets for a tenant.
 *
 * Deletes (not voids) every row from KDS operational tables so you get a
 * completely clean slate for testing.  Config/settings tables (stations,
 * routing rules, bump-bar profiles, alert profiles, etc.) are left alone.
 *
 * Tables cleaned (in FK-safe order):
 *   1. fnb_kds_send_events
 *   2. fnb_kds_send_tracking
 *   3. fnb_kds_dispatch_attempts
 *   4. fnb_kitchen_ticket_items
 *   5. fnb_kitchen_tickets
 *   6. fnb_kitchen_ticket_counters
 *   7. fnb_kds_terminal_heartbeats
 *
 * Usage:
 *   node scripts/nuke-kds-orders.cjs              — local DB only (dry run)
 *   node scripts/nuke-kds-orders.cjs --live       — actually delete (local)
 *   node scripts/nuke-kds-orders.cjs --prod       — production DB (dry run)
 *   node scripts/nuke-kds-orders.cjs --prod --live — production DB (delete)
 *   node scripts/nuke-kds-orders.cjs --both --live — local + production
 */

const postgres = require('postgres');
const path = require('path');
const readline = require('readline');

// Sunset Resort tenant ID
const TENANT_ID = '01KJ7X5E6DZ36PS7ZJM78EZNE9';

// Load env files
require('dotenv').config({ path: path.join(__dirname, '../.env.remote'), override: true });
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const args = process.argv.slice(2);
const isLive = args.includes('--live');
const doProd = args.includes('--prod') || args.includes('--both');
const doLocal = !args.includes('--prod') || args.includes('--both');

const TABLES = [
  'fnb_kds_send_events',
  'fnb_kds_send_tracking',
  'fnb_kds_dispatch_attempts',
  'fnb_kitchen_ticket_items',
  'fnb_kitchen_tickets',
  'fnb_kitchen_ticket_counters',
  'fnb_kds_terminal_heartbeats',
];

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function nukeKds(sql, label, dryRun) {
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  ${label}  —  ${dryRun ? 'DRY RUN' : '⚠️  LIVE DELETE'}`);
  console.log(`  Tenant: ${TENANT_ID} (Sunset Resort)`);
  console.log(`${'═'.repeat(50)}\n`);

  // Count first
  for (const table of TABLES) {
    const rows = await sql.unsafe(
      `SELECT COUNT(*) AS cnt FROM ${table} WHERE tenant_id = $1`,
      [TENANT_ID],
    );
    console.log(`  ${table.padEnd(38)} ${rows[0].cnt} rows`);
  }

  if (dryRun) {
    console.log('\n  ─── DRY RUN — no rows deleted ───');
    console.log('  Re-run with --live to delete.\n');
    return;
  }

  // Confirm
  const answer = await prompt(`\n  Type "yes" to DELETE all rows from ${label}: `);
  if (answer !== 'yes') {
    console.log('  Aborted.\n');
    return;
  }

  // Delete in FK-safe order inside a transaction
  const result = await sql.begin(async (tx) => {
    const counts = {};
    for (const table of TABLES) {
      const deleted = await tx.unsafe(
        `DELETE FROM ${table} WHERE tenant_id = $1`,
        [TENANT_ID],
      );
      counts[table] = deleted.count;
      console.log(`  ✓ ${table.padEnd(38)} ${deleted.count} deleted`);
    }
    return counts;
  });

  const total = Object.values(result).reduce((a, b) => Number(a) + Number(b), 0);
  console.log(`\n  ✅ Done — ${total} total rows deleted from ${label}.\n`);
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║   KDS Nuclear Cleanup — Sunset Resort        ║');
  console.log('╚══════════════════════════════════════════════╝');

  if (doLocal) {
    const localUrl = process.env.DATABASE_URL_LOCAL || process.env.DATABASE_URL;
    if (!localUrl) {
      console.error('No DATABASE_URL_LOCAL or DATABASE_URL set for local DB');
    } else {
      const sql = postgres(localUrl, { max: 1, prepare: false, idle_timeout: 5 });
      try {
        await nukeKds(sql, 'LOCAL DB', !isLive);
      } finally {
        await sql.end({ timeout: 2 });
      }
    }
  }

  if (doProd) {
    const prodUrl = process.env.DATABASE_URL_ADMIN;
    if (!prodUrl) {
      console.error('No DATABASE_URL_ADMIN set for production DB');
      process.exit(1);
    }
    const sql = postgres(prodUrl, { max: 1, prepare: false, idle_timeout: 5 });
    try {
      await nukeKds(sql, 'PRODUCTION DB', !isLive);
    } finally {
      await sql.end({ timeout: 2 });
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
