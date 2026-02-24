import postgres from 'postgres';
const sql = postgres('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
try {
  const r = await sql`SELECT 1 AS ok`;
  console.log('DB OK:', r[0].ok);
} catch (e) {
  console.log('DB ERROR:', e.message);
}
await sql.end();
