import dotenv from 'dotenv';
dotenv.config({ path: '../../.env.remote', override: true });
dotenv.config({ path: '../../.env.local' });
dotenv.config({ path: '../../.env' });

import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL!, { max: 1, prepare: false });

async function main() {
  const rows = await sql`SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 5`;
  console.log('Last 5 applied migrations:');
  for (const r of rows) console.log(`  id=${r.id} hash=${r.hash} at=${r.created_at}`);

  // Check if category_name column exists
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'rm_item_sales' AND column_name = 'category_name'
  `;
  console.log(`\ncategory_name column exists: ${cols.length > 0}`);

  // Try running the migration manually
  if (cols.length === 0) {
    console.log('\nApplying migration 0145 manually...');
    await sql`ALTER TABLE rm_item_sales ADD COLUMN IF NOT EXISTS category_name TEXT`;
    await sql`CREATE INDEX IF NOT EXISTS idx_rm_item_sales_tenant_category ON rm_item_sales (tenant_id, category_name) WHERE category_name IS NOT NULL`;
    console.log('Done.');
  }

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
