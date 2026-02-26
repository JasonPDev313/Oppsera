/**
 * Diagnostic: check portal auth for jp@jasonpearsall.com
 * Usage: pnpm tsx tools/scripts/check-portal-auth.ts --remote
 */
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

const isRemote = process.argv.includes('--remote');
if (isRemote) {
  dotenv.config({ path: '.env.remote', override: true });
}
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import postgres from 'postgres';

async function main() {
  const connectionString = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL required');

  const client = postgres(connectionString, { max: 1, prepare: false });

  // 1. All tenants
  const tenants = await client`SELECT id, slug, name, status FROM tenants`;
  console.log('=== TENANTS ===');
  for (const t of tenants) {
    console.log(`  slug=${t.slug} | name=${t.name} | status=${t.status} | id=${t.id}`);
  }

  // 2. Customer lookup
  const email = 'jp@jasonpearsall.com';
  const custs = await client`
    SELECT c.id, c.email, c.status, c.tenant_id, t.slug as tenant_slug
    FROM customers c
    JOIN tenants t ON t.id = c.tenant_id
    WHERE LOWER(c.email) = ${email.toLowerCase()}
  `;
  console.log('\n=== CUSTOMER MATCHES ===');
  if (custs.length === 0) {
    console.log('  NO CUSTOMER FOUND with email', email);
  }
  for (const c of custs) {
    console.log(`  id=${c.id} | email=${c.email} | status=${c.status} | tenant=${c.tenant_slug} (${c.tenant_id})`);
  }

  // 3. Auth accounts
  for (const c of custs) {
    const auths = await client`
      SELECT id, tenant_id, customer_id, provider, is_active,
             CASE WHEN password_hash IS NOT NULL THEN 'YES' ELSE 'NO' END as has_pw,
             last_login_at
      FROM customer_auth_accounts
      WHERE customer_id = ${c.id}
    `;
    console.log(`\n=== AUTH ACCOUNTS for customer ${c.id} ===`);
    if (auths.length === 0) {
      console.log('  NO AUTH ACCOUNTS');
    }
    for (const a of auths) {
      console.log(`  id=${a.id} | provider=${a.provider} | active=${a.is_active} | has_pw=${a.has_pw} | last_login=${a.last_login_at}`);
    }

    // 4. Password verify
    const portalAuth = await client`
      SELECT password_hash FROM customer_auth_accounts
      WHERE customer_id = ${c.id} AND provider = 'portal'
    `;
    if (portalAuth.length > 0 && portalAuth[0].password_hash) {
      const match = await bcrypt.compare('Honka9285$$', portalAuth[0].password_hash);
      console.log(`  bcrypt.compare('Honka9285$$') = ${match}`);
    }
  }

  // 5. Check if RLS might be blocking
  console.log('\n=== RLS CHECK ===');
  const rlsStatus = await client`
    SELECT relname, relrowsecurity, relforcerowsecurity
    FROM pg_class
    WHERE relname IN ('customers', 'customer_auth_accounts')
  `;
  for (const r of rlsStatus) {
    console.log(`  ${r.relname}: rls=${r.relrowsecurity} force=${r.relforcerowsecurity}`);
  }

  await client.end();
}

main().catch((err) => { console.error('Failed:', err); process.exit(1); });
