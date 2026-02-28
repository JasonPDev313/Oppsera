import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from './schema';
import { guardedQuery } from './pool-guard';

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
      onnotice: (notice) => {
        // Log Postgres notices (timeout kills, warnings, etc.)
        console.warn(`[pg-notice] ${notice.severity}: ${notice.message}`);
      },
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

// ── guardedDb proxy ─────────────────────────────────────────────────────────
// Wraps ALL db.select/insert/update/delete/execute/transaction calls through
// guardedQuery() automatically. Any code using guardedDb gets concurrency
// limiting, circuit breaker, per-query timeout, and pool exhaustion detection.
const GUARDED_METHODS = new Set(['select', 'insert', 'update', 'delete', 'execute', 'transaction']);

export const guardedDb: DrizzleDB = new Proxy({} as DrizzleDB, {
  get(_target, prop, receiver) {
    const instance = getDb();
    const value = Reflect.get(instance, prop, receiver);
    if (typeof value !== 'function') return value;
    if (!GUARDED_METHODS.has(prop as string)) return value.bind(instance);

    // For transaction(), wrap the whole transaction call
    if (prop === 'transaction') {
      return (...args: Parameters<DrizzleDB['transaction']>) =>
        guardedQuery(`guardedDb.transaction`, () => value.apply(instance, args));
    }

    // For select/insert/update/delete/execute — these return query builders.
    // We wrap the terminal .execute() / .then() of the builder chain.
    return (...args: unknown[]) => {
      const builder = value.apply(instance, args);
      if (builder && typeof builder === 'object' && typeof builder.then === 'function') {
        // Already a thenable (e.g., db.execute(sql`...`)) — wrap it
        const opName = `guardedDb.${String(prop)}`;
        return guardedQuery(opName, () => builder);
      }
      // Query builder — wrap its .then() so awaiting it goes through guardedQuery
      const originalThen = builder.then?.bind(builder);
      if (originalThen) {
        builder.then = (
          onFulfilled?: (value: unknown) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) => {
          const opName = `guardedDb.${String(prop)}`;
          return guardedQuery(opName, () => new Promise((resolve, reject) => {
            originalThen(resolve, reject);
          })).then(onFulfilled, onRejected);
        };
      }
      return builder;
    };
  },
});

export async function withTenant<T>(
  tenantId: string,
  callback: (tx: Database) => Promise<T>,
): Promise<T> {
  return guardedQuery('withTenant', () =>
    db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);
      return callback(tx as unknown as Database);
    }),
  );
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
