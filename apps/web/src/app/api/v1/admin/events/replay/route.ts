import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db, eventOutbox } from '@oppsera/db';

/**
 * POST /api/v1/admin/events/replay
 *
 * Resets publishedAt on all outbox events so the outbox worker re-dispatches them.
 * Consumers are idempotent (via processed_events), so already-processed events are skipped.
 * Use this after registering new consumers to backfill read models.
 */
export const POST = withMiddleware(
  async (_request, ctx) => {
    if (!ctx.isPlatformAdmin) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Platform admin access required' } },
        { status: 403 },
      );
    }

    const result = await db
      .update(eventOutbox)
      .set({ publishedAt: null })
      .where(sql`${eventOutbox.publishedAt} IS NOT NULL`)
      .returning({ id: eventOutbox.id });

    return NextResponse.json({
      data: {
        replayedCount: result.length,
        message: `Reset ${result.length} events for replay. The outbox worker will re-dispatch them.`,
      },
    });
  },
);
