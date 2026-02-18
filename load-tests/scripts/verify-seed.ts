/**
 * Verify Seed Data
 *
 * Checks that load test seed data exists and is adequate for testing.
 * Returns exit code 0 if OK, 1 if re-seeding is needed.
 *
 * Usage:
 *   npx tsx load-tests/scripts/verify-seed.ts --profile stage1
 *   npx tsx load-tests/scripts/verify-seed.ts --profile stage2-lite --min-items 500
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

const PROFILES = {
  stage1: { tenants: 10, minItems: 50, minCustomers: 25, minOrders: 100, minStock: 500 },
  'stage2-lite': { tenants: 50, minItems: 250, minCustomers: 100, minOrders: 500, minStock: 500 },
  'stage2-full': { tenants: 100, minItems: 500, minCustomers: 250, minOrders: 2500, minStock: 500 },
} as const;

type ProfileName = keyof typeof PROFILES;

const args = process.argv.slice(2);
const profileArg = (args.find((a) => a.startsWith('--profile'))?.split('=')[1]
  || args[args.indexOf('--profile') + 1]
  || 'stage1') as ProfileName;

const profileConfig = PROFILES[profileArg];
if (!profileConfig) {
  console.error(`Unknown profile: ${profileArg}`);
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const client = postgres(connectionString, { max: 3, prepare: false });
const db = drizzle(client);

interface CheckResult {
  name: string;
  ok: boolean;
  details: string;
}

async function main() {
  console.log(`\n🔍 Verifying seed data for profile: ${profileArg}\n`);

  const checks: CheckResult[] = [];

  // 1. Check tenant count
  const tenantRows = await db.execute(sql`
    SELECT count(*) AS cnt FROM tenants WHERE slug LIKE 'loadtest-tenant-%'
  `) as any[];
  const tenantCount = parseInt(tenantRows[0]?.cnt || '0', 10);
  checks.push({
    name: 'Tenant count',
    ok: tenantCount >= profileConfig.tenants,
    details: `${tenantCount} / ${profileConfig.tenants} required`,
  });

  // 2. Check items per tenant (sample first 3 tenants)
  const itemRows = await db.execute(sql`
    SELECT t.slug, count(ci.id) AS item_count
    FROM tenants t
    LEFT JOIN catalog_items ci ON ci.tenant_id = t.id AND ci.status = 'active'
    WHERE t.slug LIKE 'loadtest-tenant-%'
    GROUP BY t.slug
    ORDER BY t.slug
    LIMIT 5
  `) as any[];

  for (const row of itemRows) {
    const count = parseInt(row.item_count || '0', 10);
    checks.push({
      name: `Items (${row.slug})`,
      ok: count >= profileConfig.minItems,
      details: `${count} / ${profileConfig.minItems} required`,
    });
  }

  // 3. Check customers per tenant
  const customerRows = await db.execute(sql`
    SELECT t.slug, count(c.id) AS customer_count
    FROM tenants t
    LEFT JOIN customers c ON c.tenant_id = t.id AND c.status = 'active'
    WHERE t.slug LIKE 'loadtest-tenant-%'
    GROUP BY t.slug
    ORDER BY t.slug
    LIMIT 5
  `) as any[];

  for (const row of customerRows) {
    const count = parseInt(row.customer_count || '0', 10);
    checks.push({
      name: `Customers (${row.slug})`,
      ok: count >= profileConfig.minCustomers,
      details: `${count} / ${profileConfig.minCustomers} required`,
    });
  }

  // 4. Check orders per tenant
  const orderRows = await db.execute(sql`
    SELECT t.slug, count(o.id) AS order_count
    FROM tenants t
    LEFT JOIN orders o ON o.tenant_id = t.id AND o.status = 'placed'
    WHERE t.slug LIKE 'loadtest-tenant-%'
    GROUP BY t.slug
    ORDER BY t.slug
    LIMIT 5
  `) as any[];

  for (const row of orderRows) {
    const count = parseInt(row.order_count || '0', 10);
    checks.push({
      name: `Orders (${row.slug})`,
      ok: count >= profileConfig.minOrders,
      details: `${count} / ${profileConfig.minOrders} required`,
    });
  }

  // 5. Check stock levels (ensure headroom for load test)
  const stockRows = await db.execute(sql`
    SELECT t.slug,
           COALESCE(MIN(stock.on_hand), 0) AS min_stock,
           COALESCE(AVG(stock.on_hand), 0) AS avg_stock
    FROM tenants t
    JOIN inventory_items ii ON ii.tenant_id = t.id
    JOIN LATERAL (
      SELECT SUM(quantity_delta) AS on_hand
      FROM inventory_movements im
      WHERE im.inventory_item_id = ii.id
    ) stock ON true
    WHERE t.slug LIKE 'loadtest-tenant-%'
    GROUP BY t.slug
    ORDER BY t.slug
    LIMIT 5
  `) as any[];

  for (const row of stockRows) {
    const minStock = parseInt(row.min_stock || '0', 10);
    checks.push({
      name: `Stock levels (${row.slug})`,
      ok: minStock >= profileConfig.minStock,
      details: `min=${minStock}, avg=${Math.round(parseFloat(row.avg_stock || '0'))} (need >${profileConfig.minStock})`,
    });
  }

  // 6. Check auth-tokens.json exists
  const authPath = path.join(__dirname, '..', 'auth-tokens.json');
  const authExists = fs.existsSync(authPath);
  checks.push({
    name: 'auth-tokens.json',
    ok: authExists,
    details: authExists ? 'exists' : 'MISSING — run seed-load-test.ts',
  });

  // 7. Check seed-manifest.json exists
  const manifestPath = path.join(__dirname, '..', 'seed-manifest.json');
  const manifestExists = fs.existsSync(manifestPath);
  checks.push({
    name: 'seed-manifest.json',
    ok: manifestExists,
    details: manifestExists ? 'exists' : 'MISSING — run seed-load-test.ts',
  });

  // Print results
  console.log('─'.repeat(60));
  let allPassed = true;
  for (const check of checks) {
    const icon = check.ok ? '✅' : '❌';
    console.log(`${icon} ${check.name}: ${check.details}`);
    if (!check.ok) allPassed = false;
  }
  console.log('─'.repeat(60));

  if (allPassed) {
    console.log('\n✅ All checks passed. Seed data is adequate.\n');
    await client.end();
    process.exit(0);
  } else {
    console.log('\n❌ Some checks failed. Re-seed with:');
    console.log(`   npx tsx load-tests/scripts/seed-load-test.ts --profile ${profileArg}\n`);
    await client.end();
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
