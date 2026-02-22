/**
 * One-off script: For each tenant with accounting settings, create Tips Payable (2160) and
 * Service Charge Revenue (4500) accounts if missing, wire them to settings, and optionally
 * disable legacy GL posting.
 *
 * Safe to run multiple times (checks for existing accounts by number).
 *
 * Usage:
 *   npx tsx tools/scripts/backfill-accounting-accounts.ts
 *   npx tsx tools/scripts/backfill-accounting-accounts.ts --disable-legacy
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

const disableLegacy = process.argv.includes('--disable-legacy');

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

    // Check for existing Tips Payable account (2160)
    const existingTips = await db.execute(sql`
      SELECT id FROM gl_accounts
      WHERE tenant_id = ${tenantId} AND account_number = '2160'
      LIMIT 1
    `);
    const tipsRows = Array.from(existingTips as Iterable<Record<string, unknown>>);

    let tipsAccountId: string;
    if (tipsRows.length > 0) {
      tipsAccountId = String(tipsRows[0]!.id);
      console.log(`  Tips Payable (2160) already exists: ${tipsAccountId}`);
    } else {
      // Find the classification for Accrued Liabilities
      const classRows = await db.execute(sql`
        SELECT id FROM gl_classifications
        WHERE tenant_id = ${tenantId} AND name = 'Accrued Liabilities'
        LIMIT 1
      `);
      const classArr = Array.from(classRows as Iterable<Record<string, unknown>>);
      const classificationId = classArr.length > 0 ? String(classArr[0]!.id) : null;

      tipsAccountId = generateUlid();
      await db.execute(sql`
        INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, classification_id, is_active, is_control_account, allow_manual_posting)
        VALUES (${tipsAccountId}, ${tenantId}, '2160', 'Tips Payable', 'liability', 'credit', ${classificationId}, true, false, true)
      `);
      console.log(`  Created Tips Payable (2160): ${tipsAccountId}`);
    }

    // Check for existing Service Charge Revenue account (4500)
    const existingSvc = await db.execute(sql`
      SELECT id FROM gl_accounts
      WHERE tenant_id = ${tenantId} AND account_number = '4500'
      LIMIT 1
    `);
    const svcRows = Array.from(existingSvc as Iterable<Record<string, unknown>>);

    let svcAccountId: string;
    if (svcRows.length > 0) {
      svcAccountId = String(svcRows[0]!.id);
      console.log(`  Service Charge Revenue (4500) already exists: ${svcAccountId}`);
    } else {
      // Find the classification for Operating Revenue
      const classRows = await db.execute(sql`
        SELECT id FROM gl_classifications
        WHERE tenant_id = ${tenantId} AND name = 'Operating Revenue'
        LIMIT 1
      `);
      const classArr = Array.from(classRows as Iterable<Record<string, unknown>>);
      const classificationId = classArr.length > 0 ? String(classArr[0]!.id) : null;

      svcAccountId = generateUlid();
      await db.execute(sql`
        INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, classification_id, is_active, is_control_account, allow_manual_posting)
        VALUES (${svcAccountId}, ${tenantId}, '4500', 'Service Charge Revenue', 'revenue', 'credit', ${classificationId}, true, false, true)
      `);
      console.log(`  Created Service Charge Revenue (4500): ${svcAccountId}`);
    }

    // Wire accounts to settings
    const updates: string[] = [];

    await db.execute(sql`
      UPDATE accounting_settings
      SET
        default_tips_payable_account_id = COALESCE(default_tips_payable_account_id, ${tipsAccountId}),
        default_service_charge_revenue_account_id = COALESCE(default_service_charge_revenue_account_id, ${svcAccountId}),
        updated_at = NOW()
      WHERE tenant_id = ${tenantId}
    `);
    updates.push('wired tips + svc charge accounts to settings');

    if (disableLegacy) {
      await db.execute(sql`
        UPDATE accounting_settings
        SET enable_legacy_gl_posting = false, updated_at = NOW()
        WHERE tenant_id = ${tenantId}
      `);
      updates.push('disabled legacy GL posting');
    }

    console.log(`  ${updates.join(', ')}`);
  }

  await client.end();
  console.log('\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
