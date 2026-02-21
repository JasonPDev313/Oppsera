/**
 * Migration Rollback
 *
 * Rolls back a tenant's migrated data by:
 * 1. Deleting all rows in new tables that came from the migration (using legacy_id_map)
 * 2. Restoring the tenant's metadata flags
 * 3. Updating the cutover state
 *
 * Order: reverse of migration dependency order to avoid FK violations.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';

/** Tables in reverse dependency order for safe deletion */
const ROLLBACK_ORDER = [
  // Tier 4 (delete first)
  'payment_journal_entries',
  'tender_reversals',
  'tenders',
  'order_line_taxes',
  'order_discounts',
  'order_charges',
  'order_lines',
  'order_seats',
  'order_tips',
  'orders',

  // Tier 3
  'tee_time_order_lines',
  'tee_time_players',
  'tee_time_slots',
  'tee_time_payments',
  'tee_times',
  'event_golfers',
  'event_registrations',
  'event_products',
  'event_ledger_entries',
  'events',

  // Tier 2
  'inventory_movements',
  'inventory_items',
  'customer_memberships',
  'membership_billing_events',
  'ar_transactions',
  'ar_allocations',
  'billing_accounts',
  'loyalty_ledger_entries',
  'punch_card_usages',
  'punch_cards',
  'voucher_ledger_entries',
  'vouchers',
  'minimum_spend_charges',
  'employee_time_entries',

  // Tier 1
  'customers',
  'catalog_items',
  'catalog_categories',
  'discounts',
  'membership_plans',
  'terminals',
  'terminal_locations',

  // Tier 0
  'departments',
  'courses',
  'email_templates',
  'management_companies',
  'venue_schedules',
  'venues',
  'venue_types',
];

export async function rollbackTenant(connectionString: string, tenantId: string): Promise<void> {
  const client = postgres(connectionString, { max: 3 });
  const db = drizzle(client);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ROLLBACK — Tenant: ${tenantId}`);
  console.log(`${'='.repeat(60)}\n`);

  // Confirm this tenant has migrated data
  const mapRows = await db.execute(sql`
    SELECT COUNT(*)::int AS count FROM legacy_id_map WHERE tenant_id = ${tenantId}
  `);
  const mapCount = Array.from(mapRows as Iterable<{ count: number }>)[0]?.count ?? 0;

  if (mapCount === 0) {
    console.log('No migrated data found for this tenant. Nothing to roll back.\n');
    return;
  }

  console.log(`Found ${mapCount} ID mappings for this tenant\n`);

  let totalDeleted = 0;

  for (const table of ROLLBACK_ORDER) {
    try {
      // Delete rows that were created by the migration (have entries in legacy_id_map)
      const result = await db.execute(sql.raw(`
        DELETE FROM ${table}
        WHERE id IN (
          SELECT new_id FROM legacy_id_map
          WHERE tenant_id = '${tenantId}' AND new_table = '${table}'
        )
      `));

      const deleted = (result as any)?.count ?? 0;
      if (deleted > 0) {
        console.log(`  [rollback] ${table}: deleted ${deleted} rows`);
        totalDeleted += deleted;
      }
    } catch {
      // Table might not exist or might not have migrated data — skip
    }
  }

  // Clean up ID mappings for this tenant
  await db.execute(sql`
    DELETE FROM legacy_id_map WHERE tenant_id = ${tenantId}
  `);
  console.log(`  [rollback] legacy_id_map: cleaned ${mapCount} mappings`);

  // Reset tenant metadata
  try {
    await db.execute(sql`
      UPDATE tenants SET metadata = COALESCE(metadata, '{}'::jsonb) - 'migration_status' - 'migrated_at'
      WHERE id = ${tenantId}
    `);
  } catch {
    // Tenant might not exist
  }

  // Update cutover state
  try {
    await db.execute(sql`
      UPDATE migration_cutover_state
      SET phase = 'rolled_back',
          state_json = state_json || ${JSON.stringify({
            rolledBackAt: new Date().toISOString(),
            notes: [`Rolled back at ${new Date().toISOString()}: ${totalDeleted} rows deleted`],
          })}::jsonb,
          updated_at = NOW()
      WHERE tenant_id = ${tenantId}
    `);
  } catch {
    // Cutover state table might not exist
  }

  console.log(`\n  Total rows deleted: ${totalDeleted}`);
  console.log(`  Rollback complete for tenant ${tenantId}\n`);

  await client.end();
}

/** Dry-run rollback: show what would be deleted without deleting */
export async function rollbackDryRun(connectionString: string, tenantId: string): Promise<void> {
  const client = postgres(connectionString, { max: 3 });
  const db = drizzle(client);

  console.log(`\n  DRY RUN — Rollback preview for tenant: ${tenantId}\n`);

  for (const table of ROLLBACK_ORDER) {
    try {
      const rows = await db.execute(sql.raw(`
        SELECT COUNT(*)::int AS count FROM ${table}
        WHERE id IN (
          SELECT new_id FROM legacy_id_map
          WHERE tenant_id = '${tenantId}' AND new_table = '${table}'
        )
      `));
      const count = Array.from(rows as Iterable<{ count: number }>)[0]?.count ?? 0;
      if (count > 0) {
        console.log(`  ${table}: would delete ${count} rows`);
      }
    } catch {
      // skip
    }
  }

  await client.end();
}
