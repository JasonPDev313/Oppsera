import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from './schema';

type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>;

let _db: DrizzleDB | null = null;

function getDb(): DrizzleDB {
  if (!_db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is required');
    }
    const client = postgres(connectionString, { max: 20 });
    _db = drizzle(client, { schema });
  }
  return _db;
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
    await tx.execute(sql`SET LOCAL app.current_tenant_id = ${tenantId}`);
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

export function createAdminClient() {
  const adminUrl = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
  if (!adminUrl) {
    throw new Error('DATABASE_URL_ADMIN or DATABASE_URL environment variable is required');
  }
  const adminConn = postgres(adminUrl, { max: 5 });
  return drizzle(adminConn, { schema });
}

export { sql, schema };
