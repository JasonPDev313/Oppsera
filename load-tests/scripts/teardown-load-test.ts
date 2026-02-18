/**
 * Teardown Load Test Data
 *
 * Removes all load-test-specific data (tenants with slug 'loadtest-tenant-*').
 * Safe: only deletes rows created by seed-load-test.ts.
 *
 * Usage:
 *   npx tsx load-tests/scripts/teardown-load-test.ts
 *   npx tsx load-tests/scripts/teardown-load-test.ts --dry-run
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';

const isDryRun = process.argv.includes('--dry-run');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const client = postgres(connectionString, { max: 5, prepare: false });
const db = drizzle(client);

async function main() {
  console.log(`\n🧹 ${isDryRun ? '[DRY RUN] ' : ''}Tearing down load test data...\n`);

  // Find all load test tenants
  const tenants = await db.execute(sql`
    SELECT id, name, slug FROM tenants
    WHERE slug LIKE 'loadtest-tenant-%'
    ORDER BY slug
  `) as any[];

  if (tenants.length === 0) {
    console.log('No load test tenants found. Nothing to clean up.');
    await client.end();
    return;
  }

  console.log(`Found ${tenants.length} load test tenants:`);
  for (const t of tenants) {
    console.log(`  - ${t.slug} (${t.id})`);
  }

  const tenantIds = tenants.map((t: any) => t.id);

  if (isDryRun) {
    console.log('\n[DRY RUN] Would delete all data for the above tenants.');
    console.log('Run without --dry-run to actually delete.');
    await client.end();
    return;
  }

  console.log('\nDeleting in dependency order...');

  // Delete in reverse dependency order to avoid FK violations
  const tables = [
    // Order-related
    'order_line_taxes',
    'order_line_modifiers',
    'order_lines',
    'order_discounts',
    'order_service_charges',
    'receipt_snapshots',
    'idempotency_keys',
    // Payments
    'payment_journal_entries',
    'tender_reversals',
    'tenders',
    // Inventory
    'inventory_movements',
    'inventory_items',
    // Customers
    'customer_segment_memberships',
    'customer_segments',
    'customer_incidents',
    'customer_visits',
    'customer_household_members',
    'customer_households',
    'customer_merge_history',
    'customer_metrics_lifetime',
    'customer_metrics_daily',
    'customer_scores',
    'customer_alerts',
    'customer_wallet_accounts',
    'customer_auth_accounts',
    'customer_external_ids',
    'customer_consents',
    'customer_service_flags',
    'customer_communications',
    'customer_documents',
    'customer_preferences',
    'customer_contacts',
    'customer_activity_log',
    'customer_identifiers',
    'customer_relationships',
    'customer_privileges',
    'pricing_tiers',
    'statements',
    'ar_allocations',
    'ar_transactions',
    'billing_account_members',
    'billing_accounts',
    'membership_billing_events',
    'memberships',
    'membership_plans',
    'late_fee_policies',
    'customers',
    // Catalog
    'catalog_item_modifier_groups',
    'catalog_modifiers',
    'catalog_modifier_groups',
    'location_price_overrides',
    'catalog_item_tax_assignments',
    'catalog_items',
    'categories',
    // Tax
    'tax_group_rates',
    'tax_groups',
    'tax_rates',
    'tax_categories',
    // Orders (parent)
    'orders',
    'order_number_counters',
    // Events & audit
    'outbox_events',
    'audit_log',
    // RBAC
    'user_roles',
    'users',
    // Locations & tenant
    'locations',
    'entitlements',
    'tenants',
  ];

  for (const table of tables) {
    try {
      const result = await db.execute(sql`
        DELETE FROM ${sql.identifier(table)}
        WHERE tenant_id = ANY(${tenantIds})
      `);
      const count = (result as any)?.rowCount ?? (result as any)?.count ?? '?';
      if (count !== 0 && count !== '?') {
        console.log(`  ✓ ${table}: ${count} rows deleted`);
      }
    } catch (err: any) {
      // Table might not exist or have no tenant_id — skip silently
      if (!err.message?.includes('does not exist') && !err.message?.includes('tenant_id')) {
        console.warn(`  ⚠ ${table}: ${err.message}`);
      }
    }
  }

  // Delete tenants themselves (no tenant_id column)
  const tenantResult = await db.execute(sql`
    DELETE FROM tenants WHERE slug LIKE 'loadtest-tenant-%'
  `);
  console.log(`  ✓ tenants: ${(tenantResult as any)?.rowCount ?? '?'} rows deleted`);

  console.log('\n✅ Teardown complete.');
  await client.end();
}

main().catch((err) => {
  console.error('Teardown failed:', err);
  process.exit(1);
});
