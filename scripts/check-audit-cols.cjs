const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.remote'), override: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL, { prepare: false, max: 1 });

async function main() {
  const glCols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'gl_journal_entries' ORDER BY ordinal_position`;
  console.log('gl_journal_entries:', glCols.map(r => r.column_name).join(', '));

  const orderCols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'orders' ORDER BY ordinal_position`;
  console.log('orders:', orderCols.map(r => r.column_name).join(', '));

  const tenderCols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'tenders' ORDER BY ordinal_position`;
  console.log('tenders:', tenderCols.map(r => r.column_name).join(', '));

  const auditCols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'audit_log' ORDER BY ordinal_position`;
  console.log('audit_log:', auditCols.map(r => r.column_name).join(', '));

  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
