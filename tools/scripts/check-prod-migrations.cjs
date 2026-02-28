const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const postgres = require('postgres');

// Parse .env.vercel-prod manually
const raw = fs.readFileSync('.env.vercel-prod', 'utf8');
const match = raw.match(/^DATABASE_URL="([^"]+)"/m);
if (!match) {
  console.log('DATABASE_URL not found in .env.vercel-prod');
  process.exit(1);
}

// Strip literal \n from Vercel CLI output
let url = match[1].replace(/\\n/g, '').trim();
console.log('Connecting to prod DB...');
console.log('Host:', url.match(/@([^:\/]+)/)?.[1] || 'unknown');

const sql = postgres(url, { max: 1, idle_timeout: 5, prepare: false, connect_timeout: 15 });

(async () => {
  try {
    await sql`SET statement_timeout = '120s'`;
    await sql`SELECT 1 as ok`;
    console.log('Connection OK\n');

    // Get production migration hashes
    const prodRows = await sql`SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`;
    console.log(`Production: ${prodRows.length} migrations applied`);

    // Build hash set from production
    const prodHashes = new Set(prodRows.map(r => r.hash));

    // Load journal and compute hashes for each migration file
    const journal = JSON.parse(fs.readFileSync('packages/db/migrations/meta/_journal.json', 'utf8'));
    console.log(`Journal: ${journal.entries.length} migrations defined\n`);

    // Compute hash for each migration SQL file (drizzle uses the file content hash)
    const migrationsDir = 'packages/db/migrations';
    const journalWithHash = journal.entries.map(entry => {
      const sqlFile = path.join(migrationsDir, entry.tag + '.sql');
      let hash = null;
      if (fs.existsSync(sqlFile)) {
        const content = fs.readFileSync(sqlFile, 'utf8');
        hash = crypto.createHash('sha256').update(content).digest('hex');
      }
      return { ...entry, hash };
    });

    // Check which journal migrations are missing from production
    // Since we don't know the exact hash algorithm drizzle uses, let's also check
    // production tables to see if the schema objects actually exist

    // Alternative approach: check key tables from recent migrations
    console.log('=== CHECKING KEY TABLES FROM RECENT MIGRATIONS ===\n');

    const tableChecks = [
      { migration: '0206_host_module_v2', table: 'fnb_reservations', schema: 'public' },
      { migration: '0209_kds_comprehensive_settings', table: 'fnb_kds_bump_bar_profiles', schema: 'public' },
      { migration: '0212_discount_gl_classification', table: 'discount_gl_mappings', schema: 'public' },
      { migration: '0215_expanded_discount_gl_templates', table: 'gl_account_templates', schema: 'public', check: 'count' },
      { migration: '0219_tag_actions_lifecycle', table: 'tag_actions', schema: 'public' },
      { migration: '0220_tag_reporting_field_catalog', table: 'reporting_field_catalog', schema: 'public', check: 'count' },
      { migration: '0224_unified_revenue_activity', table: 'rm_revenue_activity', schema: 'public' },
      { migration: '0227_multi_currency_engine', table: 'currency_exchange_rates', schema: 'public' },
      { migration: '0228_intercompany_schema', table: 'intercompany_gl_account_pairs', schema: 'public' },
      { migration: '0229_project_job_costing', table: 'projects', schema: 'public' },
      { migration: '0231_expense_management', table: 'expense_policies', schema: 'public' },
      { migration: '0232_receipt_public_links', table: 'receipt_public_links', schema: 'public' },
      { migration: '0234_budgets', table: 'budgets', schema: 'public' },
      { migration: '0235_fixed_assets', table: 'fixed_assets', schema: 'public' },
      { migration: '0236_gl_document_attachments', table: 'gl_document_attachments', schema: 'public' },
      { migration: '0237_rename_tee_booking_transaction_type', table: 'gl_transaction_types', schema: 'public', check: 'rename' },
      // Also check some early/middle migrations
      { migration: '0134_rls_and_index_hardening', table: 'event_outbox', schema: 'public' },
      { migration: '0163_tag_management', table: 'tags', schema: 'public' },
      { migration: '0172_payment_gateway_foundation', table: 'payment_providers', schema: 'public' },
      { migration: '0187_erp_dual_mode_infrastructure', table: 'erp_workflow_configs', schema: 'public' },
      { migration: '0193_tenant_business_info', table: 'tenant_business_info', schema: 'public' },
      { migration: '0000_gen_ulid', table: 'users', schema: 'public' },
      { migration: '0010_orders', table: 'orders', schema: 'public' },
      { migration: '0075_accounting_core', table: 'gl_accounts', schema: 'public' },
    ];

    let existCount = 0;
    let missingCount = 0;
    const missingTables = [];

    for (const check of tableChecks) {
      const exists = await sql`
        SELECT EXISTS(
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = ${check.schema} AND table_name = ${check.table}
        ) as exists
      `;
      const tableExists = exists[0].exists;
      const status = tableExists ? '✅' : '❌';
      console.log(`  ${status} ${check.migration} → ${check.table}`);
      if (tableExists) {
        existCount++;
      } else {
        missingCount++;
        missingTables.push(check);
      }
    }

    console.log(`\n=== SUMMARY ===`);
    console.log(`Production migration rows: ${prodRows.length}`);
    console.log(`Journal entries: ${journal.entries.length}`);
    console.log(`Difference: ${prodRows.length - journal.entries.length} (prod has ${prodRows.length > journal.entries.length ? 'MORE' : 'FEWER'})`);
    console.log(`\nTable checks: ${existCount} found, ${missingCount} missing`);

    if (missingCount > 0) {
      console.log('\n⚠️  MISSING TABLES (migrations may not have been applied):');
      missingTables.forEach(t => console.log(`  ❌ ${t.migration} → ${t.table}`));
      console.log('\nTo fix: run `pnpm db:migrate:remote` to apply pending migrations');
    } else {
      console.log('\n✅ All checked tables exist on production');
    }

    // Show last 10 production migrations by date
    console.log('\n=== LAST 10 PRODUCTION MIGRATIONS ===');
    prodRows.slice(-10).forEach((r, i) => {
      const date = new Date(Number(r.created_at)).toISOString().replace('T', ' ').slice(0, 19);
      console.log(`  #${prodRows.length - 9 + i}: hash=${r.hash.slice(0, 16)}...  applied=${date}`);
    });

    await sql.end();
  } catch (err) {
    console.error('Error:', err.message);
    try { await sql.end(); } catch {};
    process.exit(1);
  }
})();
