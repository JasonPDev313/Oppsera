/**
 * Additive script — inserts missing entitlements for existing tenants.
 * Does NOT truncate or delete anything.
 *
 * Usage: npx tsx scripts/add-missing-entitlements.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL_ADMIN or DATABASE_URL is required');
}

const sql = postgres(connectionString, { prepare: false, max: 1 });

// All module keys that should exist for every tenant
const REQUIRED_MODULE_KEYS = [
  'platform_core',
  'catalog',
  'orders',
  'pos_retail',
  'payments',
  'inventory',
  'customers',
  'reporting',
  'golf_ops',
  'semantic',
  'room_layouts',
  'accounting',
  'ap',
  'ar',
];

async function main() {
  // Get all active tenants
  const tenants = await sql`SELECT id, name FROM tenants WHERE status = 'active'`;
  console.log(`Found ${tenants.length} active tenant(s)\n`);

  for (const tenant of tenants) {
    console.log(`Tenant: ${tenant.name} (${tenant.id})`);

    // Get existing entitlements for this tenant
    const existing = await sql`
      SELECT module_key FROM entitlements WHERE tenant_id = ${tenant.id}
    `;
    const existingKeys = new Set(existing.map((r: any) => r.module_key));

    // Find missing keys
    const missing = REQUIRED_MODULE_KEYS.filter(k => !existingKeys.has(k));

    if (missing.length === 0) {
      console.log('  All entitlements present. Nothing to do.\n');
      continue;
    }

    console.log(`  Missing: ${missing.join(', ')}`);

    // Insert missing entitlements
    for (const moduleKey of missing) {
      await sql`
        INSERT INTO entitlements (tenant_id, module_key, plan_tier, is_enabled, limits, activated_at)
        VALUES (
          ${tenant.id},
          ${moduleKey},
          'standard',
          true,
          ${{ max_seats: 25, max_locations: 10, max_devices: 10 }}::jsonb,
          NOW()
        )
        ON CONFLICT (tenant_id, module_key) DO NOTHING
      `;
    }

    console.log(`  Added ${missing.length} entitlement(s)\n`);
  }

  await sql.end();
  console.log('Done.');
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
