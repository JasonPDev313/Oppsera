/**
 * Admin DB helper — runs a callback inside a transaction with RLS bypassed.
 *
 * Tables with FORCE ROW LEVEL SECURITY filter on app.current_tenant_id,
 * which is empty in the admin app (cross-tenant queries). This helper
 * temporarily escalates privileges so all rows are visible.
 *
 * Cascade: SET ROLE postgres → supabase_admin → SET row_security = off
 */
import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import type { Database } from '@oppsera/db';

export async function withAdminDb<T>(
  callback: (tx: Database) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // Try multiple RLS bypass approaches (Supavisor may restrict some)
    try {
      await tx.execute(sql`SET LOCAL role = 'postgres'`);
    } catch {
      try {
        await tx.execute(sql`SET LOCAL role = 'supabase_admin'`);
      } catch {
        try {
          await tx.execute(sql`SET LOCAL row_security = 'off'`);
        } catch {
          // None worked — query will return 0 rows for RLS tables
          console.warn('[admin-db] Could not bypass RLS — cross-tenant queries may return empty results');
        }
      }
    }
    return callback(tx as unknown as Database);
  });
}
