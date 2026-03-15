/**
 * Admin DB helper — runs a callback inside a transaction with RLS bypassed.
 *
 * Tables with ENABLE/FORCE ROW LEVEL SECURITY filter on app.current_tenant_id,
 * which is empty in the admin app (cross-tenant queries). This helper
 * temporarily escalates privileges so all rows are visible.
 *
 * Uses SAVEPOINTs so a failed SET ROLE doesn't abort the entire transaction
 * (PostgreSQL marks a transaction as "aborted" after any error — subsequent
 * statements fail with "current transaction is aborted" unless you ROLLBACK
 * TO SAVEPOINT first).
 *
 * Cascade: SET ROLE postgres → supabase_admin → SET row_security = off
 */
import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import type { Database } from '@oppsera/db';

let bypassMethodLogged = false;

export async function withAdminDb<T>(
  callback: (tx: Database) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const methods = [
      { label: 'SET ROLE postgres', stmt: sql`SET LOCAL role = 'postgres'` },
      { label: 'SET ROLE supabase_admin', stmt: sql`SET LOCAL role = 'supabase_admin'` },
      { label: 'SET row_security off', stmt: sql`SET LOCAL row_security = 'off'` },
    ];

    let bypassed = false;
    for (const { label, stmt } of methods) {
      try {
        await tx.execute(sql`SAVEPOINT rls_attempt`);
        await tx.execute(stmt);
        bypassed = true;
        if (!bypassMethodLogged) {
          console.info(`[admin-db] RLS bypass method: ${label}`);
          bypassMethodLogged = true;
        }
        break;
      } catch {
        try {
          await tx.execute(sql`ROLLBACK TO SAVEPOINT rls_attempt`);
        } catch {
          // ROLLBACK TO SAVEPOINT failed — transaction is unrecoverable
          console.error('[admin-db] ROLLBACK TO SAVEPOINT failed — transaction unrecoverable');
          break;
        }
      }
    }

    if (!bypassed) {
      console.warn('[admin-db] Could not bypass RLS — queries may return empty results or fail on write');
    }

    return callback(tx as unknown as Database);
  });
}
