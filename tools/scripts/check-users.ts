import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import postgres from 'postgres';

async function main() {
  console.log('Connecting to:', process.env.DATABASE_URL?.substring(0, 40) + '...');
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  const r = await sql`SELECT id, email, name FROM users LIMIT 5`;
  console.log('Users found:', r.length);
  for (const u of r) console.log(' ', u.email, u.name);
  if (r.length === 0) console.log('No users — seed has not run successfully.');
  await sql.end();
}

main().catch(console.error);
