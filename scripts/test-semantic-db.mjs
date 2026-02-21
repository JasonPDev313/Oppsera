import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Load apps/web/.env.local FIRST (like Next.js does) — it takes precedence
config({ path: resolve(__dirname, '../apps/web/.env.local') });
config({ path: resolve(__dirname, '../.env.local') });
config({ path: resolve(__dirname, '../.env') });

const dbUrl = process.env.DATABASE_URL;
console.log('DB URL prefix:', dbUrl ? dbUrl.substring(0, 40) + '...' : 'NOT SET');

if (!dbUrl) {
  console.error('DATABASE_URL not found');
  process.exit(1);
}

const sql = postgres(dbUrl, { max: 1, prepare: false, idle_timeout: 5 });

try {
  const test = await sql`SELECT 1 as ok`;
  console.log('DB connection: OK');

  // Check if semantic tables exist
  const tables = await sql`SELECT tablename FROM pg_tables WHERE tablename LIKE 'semantic%' ORDER BY tablename`;
  console.log('Semantic tables:', tables.map(r => r.tablename));

  if (tables.length === 0) {
    console.error('\n!! Semantic tables DO NOT EXIST. Run: pnpm db:migrate');
  } else {
    // Check row counts
    const metrics = await sql`SELECT count(*) as cnt FROM semantic_metrics`;
    const dims = await sql`SELECT count(*) as cnt FROM semantic_dimensions`;
    const rels = await sql`SELECT count(*) as cnt FROM semantic_metric_dimensions`;
    const lenses = await sql`SELECT count(*) as cnt FROM semantic_lenses`;

    console.log('\nRow counts:');
    console.log('  semantic_metrics:', metrics[0].cnt);
    console.log('  semantic_dimensions:', dims[0].cnt);
    console.log('  semantic_metric_dimensions:', rels[0].cnt);
    console.log('  semantic_lenses:', lenses[0].cnt);

    if (Number(metrics[0].cnt) === 0) {
      console.error('\n!! Registry is EMPTY. Run: pnpm --filter @oppsera/module-semantic semantic:sync');
    } else {
      console.log('\nRegistry looks good!');
    }
  }

  // Check entitlements for the test tenant
  const entitlements = await sql`
    SELECT e.module_key, e.is_enabled, e.tenant_id
    FROM entitlements e
    WHERE e.module_key = 'semantic'
    LIMIT 5
  `;
  console.log('\nSemantic entitlement provisioned:', entitlements.length > 0 ? 'YES' : 'NO');
  if (entitlements.length > 0) console.log('  Details:', entitlements.map(r => ({ tenantId: r.tenant_id, enabled: r.is_enabled })));

  // Check semantic.query permission - first check table structure
  const rpCols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'role_permissions' ORDER BY ordinal_position`;
  console.log('role_permissions columns:', rpCols.map(r => r.column_name));
  const perms = await sql`SELECT * FROM role_permissions WHERE permission LIKE 'semantic%' LIMIT 10`;
  console.log('Semantic permissions:', perms.length > 0 ? perms : 'NONE FOUND');

} catch (e) {
  console.error('Error:', e.message);
} finally {
  await sql.end();
}
