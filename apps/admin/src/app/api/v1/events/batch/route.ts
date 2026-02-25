import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { logAdminAudit, getClientIp } from '@/lib/admin-audit';
import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import {
  retryDeadLetter,
  getEventBus,
} from '@oppsera/core';

// POST - Batch retry or discard
export const POST = withAdminPermission(async (req: NextRequest, session) => {
  const body = await req.json();
  const { action, ids, reason, filters } = body;

  if (action !== 'retry' && action !== 'discard') {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'action must be retry or discard' } },
      { status: 400 },
    );
  }

  // Resolve IDs either from explicit list or from filters
  let deadLetterIds: string[] = ids ?? [];

  if (!ids && filters) {
    // Build query from filters
    const conditions: ReturnType<typeof sql>[] = [sql`status = 'failed'`];
    if (filters.tenantId) conditions.push(sql`tenant_id = ${filters.tenantId}`);
    if (filters.consumerName) conditions.push(sql`consumer_name = ${filters.consumerName}`);
    if (filters.eventType) conditions.push(sql`event_type = ${filters.eventType}`);

    const whereClause = sql.join(conditions, sql` AND `);
    const result = await db.execute(
      sql`SELECT id FROM event_dead_letters WHERE ${whereClause} LIMIT 500`,
    );
    deadLetterIds = Array.from(result as Iterable<Record<string, unknown>>).map(
      (r) => r.id as string,
    );
  }

  if (deadLetterIds.length === 0) {
    return NextResponse.json({ data: { attempted: 0, succeeded: 0, failed: 0 } });
  }

  const adminRef = `admin:${session.adminId}`;
  let succeeded = 0;
  let failed = 0;

  if (action === 'retry') {
    const eventBus = getEventBus();
    for (const id of deadLetterIds) {
      try {
        const result = await retryDeadLetter(id, eventBus);
        if (result.success) {
          // Log retry attempt
          await db.execute(sql`
            INSERT INTO dead_letter_retry_log (dead_letter_id, retry_number, retried_by, retry_result)
            VALUES (
              ${id},
              (SELECT COALESCE(MAX(retry_number), 0) + 1 FROM dead_letter_retry_log WHERE dead_letter_id = ${id}),
              ${adminRef},
              'success'
            )
          `);
          succeeded++;
        } else {
          await db.execute(sql`
            INSERT INTO dead_letter_retry_log (dead_letter_id, retry_number, retried_by, retry_result, error_message)
            VALUES (
              ${id},
              (SELECT COALESCE(MAX(retry_number), 0) + 1 FROM dead_letter_retry_log WHERE dead_letter_id = ${id}),
              ${adminRef},
              'failed',
              ${result.error ?? null}
            )
          `);
          failed++;
        }
      } catch {
        failed++;
      }
    }
  } else {
    // Discard
    if (!reason) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'reason is required for batch discard' } },
        { status: 400 },
      );
    }

    for (const id of deadLetterIds) {
      try {
        await db.execute(sql`
          UPDATE event_dead_letters
          SET status = 'discarded', resolved_at = now(), resolved_by = ${adminRef}, resolution_notes = ${reason}
          WHERE id = ${id} AND status = 'failed'
        `);
        succeeded++;
      } catch {
        failed++;
      }
    }
  }

  void logAdminAudit({
    session,
    action: `dlq.batch_${action}`,
    entityType: 'dead_letter',
    entityId: `batch_${deadLetterIds.length}`,
    afterSnapshot: { action, count: deadLetterIds.length, succeeded, failed, reason },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json({ data: { attempted: deadLetterIds.length, succeeded, failed } });
}, { permission: 'tenants.edit' });
