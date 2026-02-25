/**
 * Seed a test guest pay session with a known lookup code for local testing.
 *
 * Usage:
 *   pnpm tsx tools/scripts/seed-guest-pay-test.ts
 *   pnpm tsx tools/scripts/seed-guest-pay-test.ts --remote
 *
 * After running, go to http://localhost:3000/pay and enter code: 123456
 */
import dotenv from 'dotenv';

const isRemote = process.argv.includes('--remote');
if (isRemote) {
  dotenv.config({ path: '.env.remote', override: true });
}
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import postgres from 'postgres';
import { randomBytes } from 'crypto';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1, prepare: false });

async function main() {
  // Find a tenant + location to attach the session to
  const tenants = await sql`SELECT id, name FROM tenants LIMIT 1`;
  if (tenants.length === 0) {
    console.error('No tenants found. Run pnpm db:seed first.');
    process.exit(1);
  }
  const tenantId = tenants[0]!.id as string;
  const tenantName = tenants[0]!.name as string;

  const locations = await sql`SELECT id, name FROM locations WHERE tenant_id = ${tenantId} LIMIT 1`;
  if (locations.length === 0) {
    console.error('No locations found for tenant. Run pnpm db:seed first.');
    process.exit(1);
  }
  const locationId = locations[0]!.id as string;

  // Generate a unique token (base64url, 32 bytes)
  const token = randomBytes(32).toString('base64url');

  // Deactivate any existing test sessions with the same lookup code
  await sql`
    UPDATE guest_pay_sessions
    SET status = 'superseded', updated_at = NOW()
    WHERE lookup_code = '123456' AND status = 'active'
  `;

  // Generate a ULID-like ID
  const id = `test_gp_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`;

  // Insert the test session — expires 24 hours from now
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const tipSettings = {
    tipType: 'percentage',
    presets: [15, 20, 25],
    allowCustom: true,
    allowNoTip: true,
    calculationBase: 'subtotal_pre_tax',
    roundingMode: 'nearest_cent',
    maxTipPercent: 100,
    maxTipAmountCents: 100_000,
  };

  await sql`
    INSERT INTO guest_pay_sessions (
      id, tenant_id, location_id, tab_id, order_id, server_user_id,
      token, lookup_code, status,
      subtotal_cents, tax_cents, service_charge_cents, discount_cents, total_cents,
      tip_settings_snapshot,
      table_number, party_size, restaurant_name,
      expires_at, created_at, updated_at
    ) VALUES (
      ${id}, ${tenantId}, ${locationId}, ${'test-tab-001'}, ${null}, ${null},
      ${token}, ${'123456'}, ${'active'},
      ${4250}, ${340}, ${0}, ${0}, ${4590},
      ${JSON.stringify(tipSettings)}::jsonb,
      ${'7'}, ${2}, ${tenantName},
      ${expiresAt.toISOString()}::timestamptz, NOW(), NOW()
    )
  `;

  console.log('');
  console.log('  Test Guest Pay session created!');
  console.log('');
  console.log(`  Lookup code:  123456`);
  console.log(`  Token URL:    /pay/${token}`);
  console.log(`  Tenant:       ${tenantName}`);
  console.log(`  Check total:  $45.90  (subtotal $42.50 + tax $3.40)`);
  console.log(`  Table:        7  (party of 2)`);
  console.log(`  Expires:      ${expiresAt.toLocaleString()}`);
  console.log('');
  console.log('  To test:');
  console.log('    1. Go to http://localhost:3000/pay');
  console.log('    2. Enter code: 123456');
  console.log(`    3. Or go directly to: http://localhost:3000/pay/${token}`);
  console.log('');

  await sql.end();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
