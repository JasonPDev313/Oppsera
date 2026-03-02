/**
 * One-off script: Backfill discount_classification on existing order_discounts rows,
 * create missing discount GL accounts for existing tenants, and seed default
 * discount_gl_mappings entries.
 *
 * Safe to run multiple times (uses ON CONFLICT DO NOTHING / WHERE IS NULL guards).
 *
 * Part 1: Classify existing order_discounts rows
 *   - type = 'comp' → 'manager_comp'
 *   - type = 'fixed' or 'percentage' (or anything else) → 'manual_discount'
 *
 * Part 2: For tenants with accounting bootstrapped:
 *   - Create missing discount GL accounts (4100–4114, 6150–6158)
 *   - Wire default_discount_account_id + default_price_override_expense_account_id
 *   - Seed discount_gl_mappings for all sub-departments × all classifications
 *
 * Usage:
 *   pnpm tsx tools/scripts/backfill-discount-classifications.ts           # local DB
 *   pnpm tsx tools/scripts/backfill-discount-classifications.ts --remote  # production DB
 */
import dotenv from 'dotenv';

const isRemote = process.argv.includes('--remote');
if (isRemote) {
  dotenv.config({ path: '.env.remote', override: true });
}
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { generateUlid, DISCOUNT_CLASSIFICATIONS } from '@oppsera/shared';
import { sql } from 'drizzle-orm';

const connectionString = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL_ADMIN or DATABASE_URL is required');

const client = postgres(connectionString, { max: 1, prepare: false });
const db = drizzle(client);

// Account definitions to create per tenant (24 total)
const DISCOUNT_ACCOUNTS = [
  // Contra-revenue (4100–4114)
  { code: '4100', name: 'Sales Discounts - Manual',      type: 'revenue', normalBalance: 'debit', classification: 'Sales Discounts' },
  { code: '4101', name: 'Promotional Discounts',          type: 'revenue', normalBalance: 'debit', classification: 'Sales Discounts' },
  { code: '4102', name: 'Employee Discounts',             type: 'revenue', normalBalance: 'debit', classification: 'Sales Discounts' },
  { code: '4103', name: 'Loyalty Program Discounts',      type: 'revenue', normalBalance: 'debit', classification: 'Sales Discounts' },
  { code: '4104', name: 'Member Discounts',               type: 'revenue', normalBalance: 'debit', classification: 'Sales Discounts' },
  { code: '4105', name: 'Price Match Adjustments',        type: 'revenue', normalBalance: 'debit', classification: 'Sales Discounts' },
  { code: '4106', name: 'Volume / Quantity Discounts',    type: 'revenue', normalBalance: 'debit', classification: 'Sales Discounts' },
  { code: '4107', name: 'Senior / Military Discounts',    type: 'revenue', normalBalance: 'debit', classification: 'Sales Discounts' },
  { code: '4108', name: 'Group / Event Discounts',        type: 'revenue', normalBalance: 'debit', classification: 'Sales Discounts' },
  { code: '4109', name: 'Seasonal / Clearance Markdowns', type: 'revenue', normalBalance: 'debit', classification: 'Sales Discounts' },
  { code: '4110', name: 'Vendor-Funded Promotions',       type: 'revenue', normalBalance: 'debit', classification: 'Sales Discounts' },
  { code: '4111', name: 'Rain Check Credits',             type: 'revenue', normalBalance: 'debit', classification: 'Sales Discounts' },
  { code: '4112', name: 'Cash / Early Payment Discounts', type: 'revenue', normalBalance: 'debit', classification: 'Sales Discounts' },
  { code: '4113', name: 'Bundle / Package Discounts',     type: 'revenue', normalBalance: 'debit', classification: 'Sales Discounts' },
  { code: '4114', name: 'Trade Discounts',                type: 'revenue', normalBalance: 'debit', classification: 'Sales Discounts' },
  // Expense (6150–6158)
  { code: '6150', name: 'Manager Comps',                  type: 'expense', normalBalance: 'debit', classification: 'Comps & Write-offs' },
  { code: '6151', name: 'Promotional Comps',              type: 'expense', normalBalance: 'debit', classification: 'Comps & Write-offs' },
  { code: '6152', name: 'Quality Recovery Expense',       type: 'expense', normalBalance: 'debit', classification: 'Comps & Write-offs' },
  { code: '6153', name: 'Price Override Loss',            type: 'expense', normalBalance: 'debit', classification: 'Comps & Write-offs' },
  { code: '6154', name: 'Other Comps & Write-offs',       type: 'expense', normalBalance: 'debit', classification: 'Comps & Write-offs' },
  { code: '6155', name: 'Spoilage & Waste Write-offs',    type: 'expense', normalBalance: 'debit', classification: 'Comps & Write-offs' },
  { code: '6156', name: 'Charity / Donation Comps',       type: 'expense', normalBalance: 'debit', classification: 'Comps & Write-offs' },
  { code: '6157', name: 'Training & Staff Meals',         type: 'expense', normalBalance: 'debit', classification: 'Comps & Write-offs' },
  { code: '6158', name: 'Insurance Recovery Write-offs',  type: 'expense', normalBalance: 'debit', classification: 'Comps & Write-offs' },
] as const;

async function main() {
  console.log(`Backfilling discount classifications (${isRemote ? 'REMOTE' : 'LOCAL'})...\n`);

  // ── Part 1: Classify existing order_discounts ─────────────────

  console.log('Part 1: Classifying existing order_discounts rows...');

  // Comps → manager_comp
  const compResult = await db.execute(sql`
    UPDATE order_discounts
    SET discount_classification = 'manager_comp'
    WHERE discount_classification IS NULL
      AND type = 'comp'
  `);
  const compCount = (compResult as unknown as { count: number }).count ?? 0;
  console.log(`  Classified ${compCount} comp discount(s) as 'manager_comp'`);

  // Everything else → manual_discount
  const manualResult = await db.execute(sql`
    UPDATE order_discounts
    SET discount_classification = 'manual_discount'
    WHERE discount_classification IS NULL
  `);
  const manualCount = (manualResult as unknown as { count: number }).count ?? 0;
  console.log(`  Classified ${manualCount} other discount(s) as 'manual_discount'`);

  // ── Part 2: Create accounts + seed mappings for existing tenants ──

  console.log('\nPart 2: Creating discount GL accounts + seeding mappings...');

  const tenantsWithAccounting = await db.execute(sql`
    SELECT s.tenant_id, t.name AS tenant_name
    FROM accounting_settings s
    JOIN tenants t ON t.id = s.tenant_id
  `);

  const tenants = Array.from(tenantsWithAccounting as Iterable<Record<string, unknown>>);
  console.log(`Found ${tenants.length} tenant(s) with accounting settings`);

  for (const tenant of tenants) {
    const tenantId = String(tenant.tenant_id);
    const tenantName = String(tenant.tenant_name);
    console.log(`\nProcessing tenant: ${tenantName} (${tenantId})`);

    // ── 2a: Create missing GL accounts ──────────────────────────

    // Build a map of classification name → existing GL classification ID
    const classificationRows = await db.execute(sql`
      SELECT id, name FROM gl_classifications
      WHERE tenant_id = ${tenantId}
    `);
    const classificationMap = new Map<string, string>();
    for (const row of Array.from(classificationRows as Iterable<Record<string, unknown>>)) {
      classificationMap.set(String(row.name), String(row.id));
    }

    // If 'Sales Discounts' classification doesn't exist, create it
    if (!classificationMap.has('Sales Discounts')) {
      const id = generateUlid();
      await db.execute(sql`
        INSERT INTO gl_classifications (id, tenant_id, name, account_type, sort_order, created_at, updated_at)
        VALUES (${id}, ${tenantId}, 'Sales Discounts', 'revenue', 45, NOW(), NOW())
        ON CONFLICT (tenant_id, name) DO NOTHING
      `);
      classificationMap.set('Sales Discounts', id);
      console.log('  Created GL classification: Sales Discounts');
    }

    // If 'Comps & Write-offs' classification doesn't exist, create it
    if (!classificationMap.has('Comps & Write-offs')) {
      const id = generateUlid();
      await db.execute(sql`
        INSERT INTO gl_classifications (id, tenant_id, name, account_type, sort_order, created_at, updated_at)
        VALUES (${id}, ${tenantId}, 'Comps & Write-offs', 'expense', 65, NOW(), NOW())
        ON CONFLICT (tenant_id, name) DO NOTHING
      `);
      classificationMap.set('Comps & Write-offs', id);
      console.log('  Created GL classification: Comps & Write-offs');
    }

    // Create each account if it doesn't already exist
    const accountIdByCode = new Map<string, string>();
    let accountsCreated = 0;

    for (const acct of DISCOUNT_ACCOUNTS) {
      const existing = await db.execute(sql`
        SELECT id FROM gl_accounts
        WHERE tenant_id = ${tenantId} AND account_number = ${acct.code}
        LIMIT 1
      `);
      const existingRows = Array.from(existing as Iterable<Record<string, unknown>>);

      if (existingRows.length > 0) {
        accountIdByCode.set(acct.code, String(existingRows[0]!.id));
      } else {
        const id = generateUlid();
        const classificationId = classificationMap.get(acct.classification) ?? null;
        await db.execute(sql`
          INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, classification_id, is_active, is_control_account, allow_manual_posting, created_at, updated_at)
          VALUES (${id}, ${tenantId}, ${acct.code}, ${acct.name}, ${acct.type}, ${acct.normalBalance}, ${classificationId}, true, false, true, NOW(), NOW())
          ON CONFLICT (tenant_id, account_number) DO NOTHING
        `);
        accountIdByCode.set(acct.code, id);
        accountsCreated++;
      }
    }

    if (accountsCreated > 0) {
      console.log(`  Created ${accountsCreated} new GL account(s)`);
    } else {
      console.log('  All 24 discount GL accounts already exist');
    }

    // ── 2b: Wire default accounts to settings ───────────────────

    const discountAccountId = accountIdByCode.get('4100') ?? null;
    const priceOverrideAccountId = accountIdByCode.get('6153') ?? null;

    if (discountAccountId || priceOverrideAccountId) {
      await db.execute(sql`
        UPDATE accounting_settings
        SET
          default_discount_account_id = COALESCE(default_discount_account_id, ${discountAccountId}),
          default_price_override_expense_account_id = COALESCE(default_price_override_expense_account_id, ${priceOverrideAccountId}),
          updated_at = NOW()
        WHERE tenant_id = ${tenantId}
      `);
      console.log('  Wired default discount + price override accounts to settings');
    }

    // ── 2c: Seed discount_gl_mappings ────────────────────────────

    // Find all mappable sub-departments (same logic as getMappingCoverage)
    // Categories with parent_id = departments, categories without = top-level departments
    // COALESCE(parent_id, id) gives the "mappable entity" at department/sub-department level
    const subDeptRows = await db.execute(sql`
      SELECT DISTINCT COALESCE(parent_id, id) AS sub_department_id
      FROM catalog_categories
      WHERE tenant_id = ${tenantId}
    `);
    const subDepts = Array.from(subDeptRows as Iterable<Record<string, unknown>>)
      .map(r => String(r.sub_department_id));

    if (subDepts.length === 0) {
      console.log('  No catalog sub-departments found — skipping mapping seed');
      continue;
    }

    let mappingsCreated = 0;

    for (const subDeptId of subDepts) {
      for (const cls of DISCOUNT_CLASSIFICATIONS) {
        const glAccountId = accountIdByCode.get(cls.defaultAccountCode);
        if (!glAccountId) continue;

        const result = await db.execute(sql`
          INSERT INTO discount_gl_mappings (tenant_id, sub_department_id, discount_classification, gl_account_id, created_at, updated_at)
          VALUES (${tenantId}, ${subDeptId}, ${cls.key}, ${glAccountId}, NOW(), NOW())
          ON CONFLICT (tenant_id, sub_department_id, discount_classification) DO NOTHING
        `);
        // ON CONFLICT DO NOTHING means we only count truly new rows
        const inserted = (result as unknown as { count: number }).count ?? 0;
        mappingsCreated += inserted;
      }
    }

    console.log(`  Seeded ${mappingsCreated} new discount GL mapping(s) across ${subDepts.length} sub-department(s)`);
  }

  await client.end();
  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
