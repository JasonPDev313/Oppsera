/**
 * One-off script: add 'semantic' entitlement to all dev tenants that don't have it yet.
 * Safe to run multiple times (ON CONFLICT DO NOTHING).
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { generateUlid } from '@oppsera/shared';
import { entitlements, tenants } from '@oppsera/db';
import { sql } from 'drizzle-orm';

const connectionString = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL not set');

const client = postgres(connectionString, { max: 1, prepare: false });
const db = drizzle(client);

async function main() {
  // Find all tenants
  const allTenants = await db.select({ id: tenants.id, name: tenants.name }).from(tenants);
  console.log(`Found ${allTenants.length} tenant(s)`);

  for (const tenant of allTenants) {
    await db.execute(sql`
      INSERT INTO entitlements (id, tenant_id, module_key, plan_tier, is_enabled, limits, activated_at)
      VALUES (
        ${generateUlid()},
        ${tenant.id},
        'semantic',
        'standard',
        true,
        '{"max_seats": 25, "max_locations": 10, "max_devices": 10}'::jsonb,
        NOW()
      )
      ON CONFLICT (tenant_id, module_key) DO NOTHING
    `);
    console.log(`✓ semantic entitlement added (or already exists) for tenant: ${tenant.name}`);
  }

  await client.end();
  console.log('Done.');
}

main().catch((e) => { console.error(e); process.exit(1); });
