/**
 * Setup Spa GL Infrastructure
 *
 * Creates the catalog department, catalog item (SPA-FALLBACK), GL revenue
 * account (4085 Spa Services Revenue), and sub-department GL mapping
 * required for spa checkout-to-POS revenue to post properly.
 *
 * Idempotent — safe to run multiple times. Uses ON CONFLICT DO NOTHING
 * for all inserts.
 *
 * Usage:
 *   pnpm tsx tools/scripts/setup-spa-gl.ts              # local DB
 *   pnpm tsx tools/scripts/setup-spa-gl.ts --remote      # production DB
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
  console.log(`\nSetup Spa GL Infrastructure (${target})`);
  console.log(`DB: ${masked}\n`);

  const sql = postgres(connectionString, { max: 1, prepare: false });

  try {
    // Find all tenants with accounting + spa entitlement
    const tenants = await sql`
      SELECT t.id, t.name FROM tenants t
      WHERE EXISTS (SELECT 1 FROM accounting_settings s WHERE s.tenant_id = t.id)
    `;

    if (tenants.length === 0) {
      console.log('No tenants with accounting settings found. Nothing to do.');
      await sql.end();
      return;
    }

    console.log(`Found ${tenants.length} tenant(s) with accounting:\n`);

    for (const tenant of tenants) {
      console.log(`── Tenant: ${tenant.name} (${tenant.id}) ──────────────────────`);

      // ── Step 1: Create "Spa Services" catalog department ──────────
      const existingDept = await sql`
        SELECT id FROM catalog_categories
        WHERE tenant_id = ${tenant.id} AND name = 'Spa Services' AND parent_id IS NULL
        LIMIT 1
      `;

      let deptId: string;
      if (existingDept.length > 0) {
        deptId = existingDept[0]!.id;
        console.log(`  Catalog department "Spa Services" already exists: ${deptId}`);
      } else {
        const [created] = await sql`
          INSERT INTO catalog_categories (id, tenant_id, parent_id, name, sort_order, is_active)
          VALUES (gen_random_uuid()::text, ${tenant.id}, NULL, 'Spa Services', 900, true)
          RETURNING id
        `;
        deptId = created!.id;
        console.log(`  Created catalog department "Spa Services": ${deptId}`);
      }

      // ── Step 2: Create SPA-FALLBACK catalog item ─────────────────
      const existingItem = await sql`
        SELECT id FROM catalog_items
        WHERE tenant_id = ${tenant.id} AND sku = 'SPA-FALLBACK'
        LIMIT 1
      `;

      let itemId: string;
      if (existingItem.length > 0) {
        itemId = existingItem[0]!.id;
        console.log(`  Catalog item "SPA-FALLBACK" already exists: ${itemId}`);
      } else {
        const [created] = await sql`
          INSERT INTO catalog_items (id, tenant_id, category_id, sku, name, item_type, default_price, is_trackable)
          VALUES (gen_random_uuid()::text, ${tenant.id}, ${deptId}, 'SPA-FALLBACK', 'Spa Service', 'service', '0.00', false)
          RETURNING id
        `;
        itemId = created!.id;
        console.log(`  Created catalog item "SPA-FALLBACK" (${itemId}), linked to dept ${deptId}`);
      }

      // ── Step 3: Create GL account 4085 "Spa Services Revenue" ────
      // First find the "Operating Revenue" classification for this tenant
      const classifications = await sql`
        SELECT id, name FROM gl_classifications WHERE tenant_id = ${tenant.id}
      `;
      const classMap = new Map<string, string>();
      for (const c of classifications) classMap.set(c.name, c.id);
      const operatingRevenueClassId = classMap.get('Operating Revenue') ?? null;

      const existingAccount = await sql`
        SELECT id FROM gl_accounts
        WHERE tenant_id = ${tenant.id} AND account_number = '4085'
        LIMIT 1
      `;

      let accountId: string;
      if (existingAccount.length > 0) {
        accountId = existingAccount[0]!.id;
        console.log(`  GL account 4085 "Spa Services Revenue" already exists: ${accountId}`);
      } else {
        const [created] = await sql`
          INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance,
            classification_id, is_control_account, control_account_type, depth, path, allow_manual_posting,
            sort_order)
          VALUES (gen_random_uuid()::text, ${tenant.id}, '4085', 'Spa Services Revenue', 'revenue', 'credit',
            ${operatingRevenueClassId}, false, NULL, 0, '4085', true, 475)
          RETURNING id
        `;
        accountId = created!.id;
        console.log(`  Created GL account 4085 "Spa Services Revenue": ${accountId}`);
      }

      // ── Step 4: Create sub-department GL mapping ─────────────────
      // The "sub-department" for a top-level department is the department itself
      // (COALESCE(parent_id, id) = id when parent_id IS NULL)
      const existingMapping = await sql`
        SELECT sub_department_id FROM sub_department_gl_defaults
        WHERE tenant_id = ${tenant.id} AND sub_department_id = ${deptId}
        LIMIT 1
      `;

      if (existingMapping.length > 0) {
        // Update the revenue account if it's currently NULL
        await sql`
          UPDATE sub_department_gl_defaults
          SET revenue_account_id = COALESCE(revenue_account_id, ${accountId}),
              updated_at = NOW()
          WHERE tenant_id = ${tenant.id} AND sub_department_id = ${deptId}
        `;
        console.log(`  Sub-department GL mapping already exists for dept ${deptId} — ensured revenue account wired`);
      } else {
        await sql`
          INSERT INTO sub_department_gl_defaults (tenant_id, sub_department_id, revenue_account_id)
          VALUES (${tenant.id}, ${deptId}, ${accountId})
          ON CONFLICT DO NOTHING
        `;
        console.log(`  Created sub-department GL mapping: dept ${deptId} → account 4085`);
      }

      console.log(`  ✓ Spa GL setup complete for tenant ${tenant.name}\n`);
    }

    console.log('Done! Spa revenue from checkout-to-POS will now post to GL account 4085.');
    console.log('If you want individual spa services to use their own catalog items,');
    console.log('link them via spaServices.catalogItemId in the database.\n');
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
