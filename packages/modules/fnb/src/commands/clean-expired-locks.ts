import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { CleanExpiredLocksInput } from '../validation';

export interface CleanExpiredLocksResult {
  deletedCount: number;
}

/**
 * Deletes all expired soft locks for a tenant.
 * Should be called periodically (every 5-10 seconds) by a background job.
 */
export async function cleanExpiredLocks(
  input: CleanExpiredLocksInput,
): Promise<CleanExpiredLocksResult> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx.execute(
      sql`DELETE FROM fnb_soft_locks
          WHERE tenant_id = ${input.tenantId}
            AND expires_at < NOW()
          RETURNING id`,
    );

    const results = Array.from(rows as Iterable<Record<string, unknown>>);
    return { deletedCount: results.length };
  });
}
