/**
 * One-off script: For each tenant with accounting settings, create Uncategorized Revenue (49900)
 * account if missing and wire it to defaultUncategorizedRevenueAccountId in settings.
 *
 * Safe to run multiple times (checks for existing accounts by number).
 *
 * Usage:
 *   npx tsx tools/scripts/backfill-uncategorized-revenue.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { generateUlid } from '@oppsera/shared';
import { sql } from 'drizzle-orm';

const connectionString = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL not set');

const client = postgres(connectionString, { max: 1, prepare: false });
const db = drizzle(client);

async function main() {
  // Find all tenants that have accounting_settings
  const tenantsWithAccounting = await db.execute(sql`
    SELECT s.tenant_id, t.name AS tenant_name
    FROM accounting_settings s
    JOIN tenants t ON t.id = s.tenant_id
  `);

  const rows = Array.from(tenantsWithAccounting as Iterable<Record<string, unknown>>);
  console.log(`Found ${rows.length} tenant(s) with accounting settings`);

  for (const row of rows) {
    const tenantId = String(row.tenant_id);
    const tenantName = String(row.tenant_name);
    console.log(`\nProcessing tenant: ${tenantName} (${tenantId})`);

    // Check for existing Uncategorized Revenue account (49900)
    const existing = await db.execute(sql`
      SELECT id FROM gl_accounts
      WHERE tenant_id = ${tenantId} AND account_number = '49900'
      LIMIT 1
    `);
    const existingRows = Array.from(existing as Iterable<Record<string, unknown>>);

    let accountId: string;
    if (existingRows.length > 0) {
      accountId = String(existingRows[0]!.id);
      console.log(`  Uncategorized Revenue (49900) already exists: ${accountId}`);
    } else {
      // Find the classification for Operating Revenue
      const classRows = await db.execute(sql`
        SELECT id FROM gl_classifications
        WHERE tenant_id = ${tenantId} AND name = 'Operating Revenue'
        LIMIT 1
      `);
      const classArr = Array.from(classRows as Iterable<Record<string, unknown>>);
      const classificationId = classArr.length > 0 ? String(classArr[0]!.id) : null;

      accountId = generateUlid();
      await db.execute(sql`
        INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, classification_id, is_active, is_control_account, allow_manual_posting)
        VALUES (${accountId}, ${tenantId}, '49900', 'Uncategorized Revenue', 'revenue', 'credit', ${classificationId}, true, false, true)
      `);
      console.log(`  Created Uncategorized Revenue (49900): ${accountId}`);
    }

    // Wire to settings (COALESCE preserves existing value if already set)
    await db.execute(sql`
      UPDATE accounting_settings
      SET
        default_uncategorized_revenue_account_id = COALESCE(default_uncategorized_revenue_account_id, ${accountId}),
        updated_at = NOW()
      WHERE tenant_id = ${tenantId}
    `);
    console.log(`  Wired to defaultUncategorizedRevenueAccountId`);
  }

  await client.end();
  console.log('\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
