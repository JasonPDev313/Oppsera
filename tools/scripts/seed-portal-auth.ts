/**
 * Additive-only script: ensures all customers in a tenant have portal auth accounts.
 * Safe to run on production — never deletes or truncates.
 *
 * Usage:
 *   pnpm tsx tools/scripts/seed-portal-auth.ts              # local DB
 *   pnpm tsx tools/scripts/seed-portal-auth.ts --remote      # Vercel/production DB
 */
import dotenv from 'dotenv';

const isRemote = process.argv.includes('--remote');
if (isRemote) {
  dotenv.config({ path: '.env.remote', override: true });
}
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import postgres from 'postgres';

async function main() {
  const connectionString = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL_ADMIN or DATABASE_URL is required');
  }

  const target = isRemote ? 'REMOTE' : 'LOCAL';
  const masked = connectionString.replace(/:[^:@]+@/, ':***@');
  console.log(`Seeding portal auth accounts (${target}): ${masked}\n`);

  const client = postgres(connectionString, { max: 1, prepare: false });

  // Password: member123 (bcrypt cost 12)
  const passwordHash = '$2a$12$Y8t.gvYUXTSSakAeeeDG2ujzHJms6Kp.JyG/BGlQzWNnpNCNk7ei2';

  // Insert portal auth accounts for all customers that don't already have one
  const result = await client`
    INSERT INTO customer_auth_accounts (id, tenant_id, customer_id, provider, password_hash, is_active)
    SELECT
      gen_random_uuid()::text,
      c.tenant_id,
      c.id,
      'portal',
      ${passwordHash},
      true
    FROM customers c
    WHERE c.email IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM customer_auth_accounts ca
        WHERE ca.tenant_id = c.tenant_id
          AND ca.customer_id = c.id
          AND ca.provider = 'portal'
      )
    RETURNING customer_id, (SELECT email FROM customers WHERE id = customer_id) AS email
  `;

  if (result.length === 0) {
    console.log('All customers already have portal auth accounts — nothing to do.');
  } else {
    console.log(`Created ${result.length} portal auth account(s):`);
    for (const row of result) {
      console.log(`  - ${row.email ?? row.customer_id}`);
    }
    console.log(`\nPassword for all: member123`);
  }

  await client.end();
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
