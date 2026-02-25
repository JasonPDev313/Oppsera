/**
 * One-off: add a specific member with portal auth to sunset-golf tenant.
 * Usage: pnpm tsx tools/scripts/add-portal-member.ts --remote
 */
import dotenv from 'dotenv';

const isRemote = process.argv.includes('--remote');
if (isRemote) {
  dotenv.config({ path: '.env.remote', override: true });
}
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import postgres from 'postgres';
import bcrypt from 'bcryptjs';

async function main() {
  const connectionString = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL required');

  const client = postgres(connectionString, { max: 1, prepare: false });

  const email = 'jp@jasonpearsall.com';
  const password = 'Honka9285$$';
  const hash = await bcrypt.hash(password, 12);

  // Resolve tenant
  const tenantRows = await client`SELECT id FROM tenants WHERE slug = 'sunset-golf'`;
  if (tenantRows.length === 0) { console.error('Tenant sunset-golf not found'); process.exit(1); }
  const tenantId = tenantRows[0].id;

  // Check if customer already exists
  const existing = await client`
    SELECT id FROM customers WHERE tenant_id = ${tenantId} AND email = ${email}
  `;
  let custId: string;

  if (existing.length > 0) {
    custId = existing[0].id;
    console.log('Customer already exists:', custId);
  } else {
    const inserted = await client`
      INSERT INTO customers (id, tenant_id, first_name, last_name, display_name, email, status, type, created_by)
      VALUES (gen_random_uuid()::text, ${tenantId}, 'Jason', 'Pearsall', 'Jason Pearsall', ${email}, 'active', 'person', 'system')
      RETURNING id
    `;
    custId = inserted[0].id;
    console.log('Customer created:', custId);
  }

  // Upsert portal auth account
  const authResult = await client`
    INSERT INTO customer_auth_accounts (id, tenant_id, customer_id, provider, password_hash, is_active)
    VALUES (gen_random_uuid()::text, ${tenantId}, ${custId}, 'portal', ${hash}, true)
    ON CONFLICT (tenant_id, customer_id, provider)
    DO UPDATE SET password_hash = ${hash}, is_active = true
    RETURNING id
  `;
  console.log('Portal auth upserted:', authResult[0].id);
  console.log(`\nLogin: ${email} / ${password} at tenant slug: sunset-golf`);

  await client.end();
}

main().catch((err) => { console.error('Failed:', err); process.exit(1); });
