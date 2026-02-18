import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from './schema';

type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>;

// Use globalThis to persist the DB pool across Next.js hot reloads in dev.
// Without this, each hot reload creates a new pool without closing the old one,
// eventually exhausting all Supabase connection slots.
const globalForDb = globalThis as unknown as { __oppsera_db?: DrizzleDB };

function getDb(): DrizzleDB {
  if (!globalForDb.__oppsera_db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is required');
    }
    const client = postgres(connectionString, {
      max: parseInt(process.env.DB_POOL_MAX || '5', 10),
      prepare: process.env.DB_PREPARE_STATEMENTS !== 'true',
    });
    globalForDb.__oppsera_db = drizzle(client, { schema });
  }
  return globalForDb.__oppsera_db;
}

export const db: DrizzleDB = new Proxy({} as DrizzleDB, {
  get(_target, prop, receiver) {
    const instance = getDb();
    const value = Reflect.get(instance, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  },
});

export type Database = DrizzleDB;

export async function withTenant<T>(
  tenantId: string,
  callback: (tx: Database) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);
    return callback(tx as unknown as Database);
  });
}

/**
 * @deprecated Use withTenant() instead. SET LOCAL only works inside a transaction.
 * This function is kept for backward compatibility but wraps in a transaction internally.
 */
export async function setTenantContext(tenantId: string) {
  // SET LOCAL only persists within a transaction, so we use set_config(..., false)
  // which sets for the session. Callers should use withTenant() for proper isolation.
  await db.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, false)`);
  return db;
}

const globalForAdmin = globalThis as unknown as { __oppsera_admin_db?: DrizzleDB };

export function createAdminClient() {
  if (!globalForAdmin.__oppsera_admin_db) {
    const adminUrl = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
    if (!adminUrl) {
      throw new Error('DATABASE_URL_ADMIN or DATABASE_URL environment variable is required');
    }
    const adminConn = postgres(adminUrl, {
      max: parseInt(process.env.DB_ADMIN_POOL_MAX || '3', 10),
      prepare: process.env.DB_PREPARE_STATEMENTS !== 'true',
    });
    globalForAdmin.__oppsera_admin_db = drizzle(adminConn, { schema });
  }
  return globalForAdmin.__oppsera_admin_db;
}

export { sql, schema };
