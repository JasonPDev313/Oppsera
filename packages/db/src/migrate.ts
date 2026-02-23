import dotenv from 'dotenv';

// --remote flag loads .env.remote first so migrations target production Supabase
const isRemote = process.argv.includes('--remote');
if (isRemote) {
  dotenv.config({ path: '../../.env.remote', override: true });
}
dotenv.config({ path: '../../.env.local' });
dotenv.config({ path: '../../.env' });

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

async function runMigrations() {
  const connectionString = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL_ADMIN or DATABASE_URL environment variable is required');
  }

  const target = isRemote ? 'REMOTE' : 'LOCAL';
  const masked = connectionString.replace(/:[^:@]+@/, ':***@');
  console.log(`Connecting to database (${target}): ${masked}`);
  const client = postgres(connectionString, { max: 1, prepare: false });
  const db = drizzle(client);

  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: './migrations' });
  console.log('Migrations complete.');

  await client.end();
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
