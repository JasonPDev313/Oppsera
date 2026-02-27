const dotenv = require('dotenv');
dotenv.config({ path: '.env.remote' });
const postgres = require('postgres');

// The .env.remote has the direct URL. We need to construct the pooler URL.
// Direct: postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres
// Pooler: postgresql://postgres.PROJECT:PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres
const directUrl = process.env.DATABASE_URL;
const match = directUrl.match(/postgresql:\/\/([^:]+):([^@]+)@db\.([^.]+)\.supabase\.co:(\d+)\/(.+)/);
if (!match) {
  console.log('Could not parse DATABASE_URL, testing direct connection only');
  process.exit(0);
}
const [, user, password, project, , dbname] = match;
const poolerUrl = `postgresql://${user}.${project}:${password}@aws-0-us-east-1.pooler.supabase.com:6543/${dbname}`;

console.log('=== Test 1: Pooler WITH connection startup params ===');
const sql1 = postgres(poolerUrl, {
  max: 1,
  prepare: false,
  connect_timeout: 10,
  connection: {
    statement_timeout: '30000',
    idle_in_transaction_session_timeout: '60000',
  },
});

sql1`SELECT 1 as test`.then(r => {
  console.log('  Result: OK', r[0]);
  return sql1.end();
}).catch(async e => {
  console.log('  FAILED:', e.message);
  console.log('  Code:', e.code);
  try { await sql1.end(); } catch {}

  console.log('\n=== Test 2: Pooler WITHOUT connection startup params ===');
  const sql2 = postgres(poolerUrl, {
    max: 1,
    prepare: false,
    connect_timeout: 10,
  });

  return sql2`SELECT 1 as test`.then(r => {
    console.log('  Result: OK', r[0]);
    console.log('\n>>> CONCLUSION: Connection startup params are REJECTED by Supavisor!');
    console.log('>>> Must remove connection {} from client.ts');
    return sql2.end();
  }).catch(e2 => {
    console.log('  Also FAILED:', e2.message);
    console.log('\n>>> Both methods fail — pooler itself may be down');
    return sql2.end();
  });
}).then(() => {
  console.log('\nDone.');
});
