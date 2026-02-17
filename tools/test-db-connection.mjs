import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config(); // fallback to .env
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.log('ERROR: DATABASE_URL is not set in environment');
  process.exit(1);
}

const masked = url.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
console.log('Connecting to:', masked);

const sql = postgres(url, { connect_timeout: 5 });

try {
  const [row] = await sql`SELECT current_database() as db, current_user as "user", version() as version`;
  console.log('\nCONNECTION SUCCESSFUL');
  console.log('  Database:', row.db);
  console.log('  User:', row.user);
  console.log('  Version:', row.version);

  // Check if our tables exist
  const tables = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `;
  console.log('\nPublic tables:', tables.length > 0 ? tables.map(t => t.table_name).join(', ') : '(none)');

  // Check RLS
  const rls = await sql`
    SELECT tablename, rowsecurity
    FROM pg_tables
    WHERE schemaname = 'public' AND rowsecurity = true
  `;
  console.log('Tables with RLS:', rls.length > 0 ? rls.map(t => t.tablename).join(', ') : '(none)');

} catch (err) {
  console.log('\nCONNECTION FAILED');
  console.log('  Error code:', err.code);
  console.log('  Message:', err.message);
  if (err.code === 'ECONNREFUSED') {
    console.log('\n  Hint: Is your Supabase/PostgreSQL instance running?');
    console.log('  Try: supabase start (if using Supabase CLI)');
    console.log('  Or:  docker compose up -d (if using Docker)');
  } else if (err.code === '28P01') {
    console.log('\n  Hint: Invalid username or password. Check DATABASE_URL credentials.');
  } else if (err.code === '3D000') {
    console.log('\n  Hint: Database does not exist. Create it first.');
  }
  process.exit(1);
} finally {
  await sql.end();
}
