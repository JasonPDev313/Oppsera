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
    // Vercel Pro: keep pool small (2) — many concurrent instances share Supabase pooler.
    // Each Vercel function handles 1 request at a time; max=2 allows parallel queries
    // within a request (Promise.all) while halving total connections vs max=3.
    // Supabase Pro Medium: 200 pooler connections. At 50+ instances × 2 = 100, safe margin.
    // Set DB_POOL_MAX=10+ only on self-hosted containers with direct Postgres.
    // NOTE: Do NOT use `connection: { statement_timeout, idle_in_transaction_session_timeout }`
    //   — Supavisor (port 6543) rejects startup parameters and kills the connection.
    //   These timeouts are set at ALTER DATABASE level instead (2026-02-27 outage fix).
    const client = postgres(connectionString, {
      max: parseInt(process.env.DB_POOL_MAX || '2', 10),
      prepare: process.env.DB_PREPARE_STATEMENTS === 'true',
      idle_timeout: 20,
      max_lifetime: 300,
      connect_timeout: 10,
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

const globalForAdmin = globalThis as unknown as { __oppsera_admin_db?: DrizzleDB };

export function createAdminClient() {
  if (!globalForAdmin.__oppsera_admin_db) {
    const adminUrl = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
    if (!adminUrl) {
      throw new Error('DATABASE_URL_ADMIN or DATABASE_URL environment variable is required');
    }
    const adminConn = postgres(adminUrl, {
      max: parseInt(process.env.DB_ADMIN_POOL_MAX || '2', 10),
      prepare: process.env.DB_PREPARE_STATEMENTS === 'true',
      idle_timeout: 20,
      max_lifetime: 300,
      connect_timeout: 10,
    });
    globalForAdmin.__oppsera_admin_db = drizzle(adminConn, { schema });
  }
  return globalForAdmin.__oppsera_admin_db;
}

export { sql, schema };
