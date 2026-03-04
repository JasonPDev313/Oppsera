import type { RequestContext } from '@oppsera/core/auth/context';
import { withTenant } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import { AppError } from '@oppsera/shared';

/**
 * Atomically swap a waitlist entry's position with its neighbor.
 * direction: 'up' moves closer to front (lower position number)
 * direction: 'down' moves farther back (higher position number)
 *
 * Locks both rows in a single query ordered by id to prevent deadlocks
 * when concurrent bumps target overlapping pairs.
 */
export async function bumpWaitlistPosition(
  ctx: RequestContext,
  entryId: string,
  direction: 'up' | 'down',
) {
  // Runtime guard — prevents sql.raw injection if TypeScript guard is ever bypassed
  if (direction !== 'up' && direction !== 'down') {
    throw new AppError('INVALID_INPUT', 'Invalid direction', 400);
  }

  return withTenant(ctx.tenantId, async (tx) => {
    // Use conditional sql fragments instead of sql.raw for the operator/order
    const positionFilter = direction === 'up'
      ? sql`AND w2.position < w1.position`
      : sql`AND w2.position > w1.position`;
    const neighborOrder = direction === 'up'
      ? sql`ORDER BY w2.position DESC`
      : sql`ORDER BY w2.position ASC`;

    // Single query to find the entry + its neighbor, locked in id order to prevent deadlocks.
    const pairRows = await tx.execute(sql`
      WITH target AS (
        SELECT id, position, location_id, business_date, status
        FROM fnb_waitlist_entries
        WHERE id = ${entryId}
          AND tenant_id = ${ctx.tenantId}
          AND status IN ('waiting', 'notified')
      ),
      neighbor AS (
        SELECT w2.id, w2.position
        FROM fnb_waitlist_entries w2, target w1
        WHERE w2.tenant_id = ${ctx.tenantId}
          AND w2.location_id = w1.location_id
          AND w2.business_date = w1.business_date
          AND w2.status IN ('waiting', 'notified')
          ${positionFilter}
        ${neighborOrder}
        LIMIT 1
      ),
      locked AS (
        SELECT e.id, e.position
        FROM fnb_waitlist_entries e
        WHERE e.id IN (SELECT id FROM target UNION ALL SELECT id FROM neighbor)
        ORDER BY e.id
        FOR UPDATE
      )
      SELECT
        t.id AS target_id, t.position AS target_pos,
        n.id AS neighbor_id, n.position AS neighbor_pos
      FROM target t
      LEFT JOIN neighbor n ON true
    `);

    const pair = Array.from(pairRows as Iterable<Record<string, unknown>>)[0];
    if (!pair || !pair.target_id) {
      throw new AppError('NOT_FOUND', 'Waitlist entry not found or not active', 404);
    }
    if (!pair.neighbor_id) {
      throw new AppError(
        'INVALID_OPERATION',
        direction === 'up' ? 'Already at the front of the queue' : 'Already at the back of the queue',
        409,
      );
    }

    const targetId = String(pair.target_id);
    const neighborId = String(pair.neighbor_id);
    const targetPos = Number(pair.target_pos);
    const neighborPos = Number(pair.neighbor_pos);

    // Atomic swap with explicit ELSE to prevent NULL on NOT NULL column
    await tx.execute(sql`
      UPDATE fnb_waitlist_entries
      SET position = CASE
        WHEN id = ${targetId} THEN ${neighborPos}
        WHEN id = ${neighborId} THEN ${targetPos}
        ELSE position
      END,
      updated_at = now()
      WHERE id IN (${targetId}, ${neighborId})
        AND tenant_id = ${ctx.tenantId}
    `);

    return { entryId: targetId, newPosition: neighborPos, swappedWith: neighborId };
  });
}
