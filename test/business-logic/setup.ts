/**
 * Test Database Setup
 *
 * Creates an isolated test environment with RLS enabled.
 * Each test suite gets its own tenant for isolation.
 * Cleanup runs after all suites complete.
 *
 * Requires:
 *   DATABASE_URL — app-role connection string (with RLS enforcement)
 *   DATABASE_URL_ADMIN — admin connection for setup/teardown (bypasses RLS)
 */

import dotenv from 'dotenv';
dotenv.config({ path: '../../.env.local' });
dotenv.config({ path: '../../.env' });

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import * as schema from '@oppsera/db/schema';

// ── Connections ──
const ADMIN_URL = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
const APP_URL = process.env.DATABASE_URL;

if (!ADMIN_URL || !APP_URL) {
  throw new Error(
    'DATABASE_URL and DATABASE_URL_ADMIN environment variables are required for business logic tests',
  );
}

// Admin: bypasses RLS for setup/teardown
const adminClient = postgres(ADMIN_URL, { max: 5, prepare: false });
export const adminDb = drizzle(adminClient, { schema });

// App: enforces RLS (tests run through this)
const appClient = postgres(APP_URL, { max: 5, prepare: false });
export const appDb = drizzle(appClient, { schema });

// ── Test Tenant Registry ──
// Track all test tenants for cleanup
const testTenantIds: string[] = [];

export function registerTestTenant(tenantId: string) {
  testTenantIds.push(tenantId);
}

// ── Helpers ──

/**
 * Execute a callback within a tenant's RLS context.
 * Uses app-role connection with set_config for tenant isolation.
 */
export async function withTestTenant<T>(
  tenantId: string,
  callback: (tx: typeof appDb) => Promise<T>,
): Promise<T> {
  return appDb.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`,
    );
    return callback(tx as unknown as typeof appDb);
  });
}

/**
 * Generate a ULID for test data.
 * Uses crypto for randomness.
 */
export function testUlid(): string {
  const timestamp = Date.now().toString(36).padStart(10, '0');
  const random = Array.from(crypto.getRandomValues(new Uint8Array(10)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
  return `${timestamp}${random}`.toUpperCase().slice(0, 26);
}

// ── Global Cleanup ──

afterAll(async () => {
  // Clean up test tenants in reverse dependency order
  if (testTenantIds.length > 0) {
    const tables = [
      'order_line_taxes',
      'order_lines',
      'order_charges',
      'order_discounts',
      'payment_journal_entries',
      'tender_reversals',
      'tenders',
      'inventory_movements',
      'inventory_items',
      'customers',
      'catalog_item_location_tax_groups',
      'tax_group_rates',
      'tax_groups',
      'tax_rates',
      'tax_categories',
      'catalog_item_modifier_groups',
      'catalog_modifiers',
      'catalog_modifier_groups',
      'catalog_location_prices',
      'catalog_items',
      'categories',
      'orders',
      'order_number_counters',
      'idempotency_keys',
      'outbox_events',
      'audit_log',
      'user_roles',
      'users',
      'entitlements',
      'locations',
      'tenants',
    ];

    for (const table of tables) {
      try {
        await adminDb.execute(
          sql`DELETE FROM ${sql.identifier(table)} WHERE tenant_id = ANY(${testTenantIds})`,
        );
      } catch {
        // Table might not exist or have no tenant_id — skip
      }
    }

    // Clean tenants themselves
    for (const tenantId of testTenantIds) {
      await adminDb.execute(sql`DELETE FROM tenants WHERE id = ${tenantId}`);
    }
  }

  await adminClient.end();
  await appClient.end();
});
