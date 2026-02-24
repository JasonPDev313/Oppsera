import { sql } from 'drizzle-orm';
import { db } from '@oppsera/db';

/**
 * Batch expire active sessions past their TTL.
 * Called inline during token lookup to lazily expire.
 * Can also be called from a cron job.
 */
export async function expireGuestPaySessions(): Promise<number> {
  const result = await db.execute(
    sql`UPDATE guest_pay_sessions
        SET status = 'expired', updated_at = NOW()
        WHERE status = 'active' AND expires_at < NOW()`,
  );

  // postgres.js returns the count of affected rows
  const rows = result as unknown as { count?: number };
  return rows.count ?? 0;
}
