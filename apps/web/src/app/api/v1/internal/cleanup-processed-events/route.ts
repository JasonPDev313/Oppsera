/**
 * M22: processed_events + event_outbox TTL cleanup cron.
 *
 * Vercel Cron daily at 3 AM UTC:
 * 1. DELETE rows from processed_events older than 7 days (idempotency records).
 * 2. DELETE rows from event_outbox that have been published (published_at IS NOT NULL)
 *    and are older than 7 days. This prevents unbounded outbox growth while keeping
 *    recent events for debugging.
 *
 * Both deletes are bounded to 10,000 rows per table per run to keep connection
 * hold time reasonable on Vercel (pool max: 2).
 */

import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

const LOG_PREFIX = '[cleanup-processed-events]';
/** Max rows to delete per table per run — prevents long-held connections. */
const DELETE_BATCH_LIMIT = 10_000;

export async function GET(request: Request) {
  // ── Auth: Vercel Cron secret ────────────────────────────────────────

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { db } = await import('@oppsera/db');

    // Intentionally cross-tenant: cron cleans stale records for ALL tenants.
    // RLS is enabled but not forced; db.execute runs as service role.

    // 1. Clean stale idempotency records
    const processedResult = await db.execute(sql`
      DELETE FROM processed_events
      WHERE id IN (
        SELECT id FROM processed_events
        WHERE processed_at < NOW() - INTERVAL '7 days'
        LIMIT ${DELETE_BATCH_LIMIT}
      )
    `);

    // 2. Clean published outbox events older than 7 days
    const outboxResult = await db.execute(sql`
      DELETE FROM event_outbox
      WHERE id IN (
        SELECT id FROM event_outbox
        WHERE published_at IS NOT NULL
          AND created_at < NOW() - INTERVAL '7 days'
        LIMIT ${DELETE_BATCH_LIMIT}
      )
    `);

    // 3. Dead-letter cleanup: unpublished events older than 30 days are stuck
    //    (drain-outbox runs every minute, so anything unpublished after 30 days is dead).
    const deadLetterResult = await db.execute(sql`
      DELETE FROM event_outbox
      WHERE id IN (
        SELECT id FROM event_outbox
        WHERE published_at IS NULL
          AND created_at < NOW() - INTERVAL '30 days'
        LIMIT ${DELETE_BATCH_LIMIT}
      )
    `);

    const deletedProcessed = Array.from(processedResult as Iterable<unknown>).length;
    const deletedOutbox = Array.from(outboxResult as Iterable<unknown>).length;
    const deletedDeadLetter = Array.from(deadLetterResult as Iterable<unknown>).length;

    console.log(
      `${LOG_PREFIX} Cleaned: ${deletedProcessed} processed_events, ${deletedOutbox} published outbox, ${deletedDeadLetter} dead-letter outbox`,
    );

    return NextResponse.json({
      data: {
        processedEventsDeleted: deletedProcessed,
        outboxPublishedDeleted: deletedOutbox,
        outboxDeadLetterDeleted: deletedDeadLetter,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error(`${LOG_PREFIX} Cron failed:`, err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
