/**
 * Seed a platform admin user for the admin panel (localhost:3001).
 * Safe to run multiple times (ON CONFLICT DO NOTHING).
 *
 * Usage: npx tsx tools/scripts/seed-platform-admin.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import bcrypt from 'bcryptjs';
import { generateUlid } from '@oppsera/shared';
import { sql } from 'drizzle-orm';

const connectionString = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL not set');

const client = postgres(connectionString, { max: 1, prepare: false });
const db = drizzle(client);

const ADMIN_EMAIL = 'admin@oppsera.com';
const ADMIN_PASSWORD = 'admin';
const ADMIN_NAME = 'Platform Admin';

async function main() {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  await db.execute(sql`
    INSERT INTO platform_admins (id, email, name, password_hash, role, is_active)
    VALUES (
      ${generateUlid()},
      ${ADMIN_EMAIL},
      ${ADMIN_NAME},
      ${passwordHash},
      'super_admin',
      true
    )
    ON CONFLICT (email) DO NOTHING
  `);

  console.log(`✓ Platform admin seeded: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  await client.end();
  console.log('Done. Restart the admin app (localhost:3001) and log in.');
}

main().catch((e) => { console.error(e); process.exit(1); });
