import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db, eventOutbox, processedEvents } from '@oppsera/db';
import { getDeadLetterStats } from '@oppsera/core/events';

export const GET = withMiddleware(
  async (_request, ctx) => {
    if (!ctx.isPlatformAdmin) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Platform admin access required' } },
        { status: 403 },
      );
    }

    const [
      [totalResult],
      [unpublishedResult],
      [oldestUnpublished],
      [publishedLast24h],
      [processedTotal],
      [processedLast24h],
      deadLetterStats,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(eventOutbox),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(eventOutbox)
        .where(sql`${eventOutbox.publishedAt} IS NULL`),
      db
        .select({ age: sql<string>`now() - min(${eventOutbox.createdAt})` })
        .from(eventOutbox)
        .where(sql`${eventOutbox.publishedAt} IS NULL`),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(eventOutbox)
        .where(sql`${eventOutbox.publishedAt} > now() - interval '24 hours'`),
      db.select({ count: sql<number>`count(*)::int` }).from(processedEvents),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(processedEvents)
        .where(sql`${processedEvents.processedAt} > now() - interval '24 hours'`),
      getDeadLetterStats(),
    ]);

    return NextResponse.json({
      data: {
        outbox: {
          totalEvents: totalResult?.count ?? 0,
          unpublishedCount: unpublishedResult?.count ?? 0,
          oldestUnpublishedAge: oldestUnpublished?.age ?? null,
          publishedLast24h: publishedLast24h?.count ?? 0,
        },
        consumers: {
          processedEventsTotal: processedTotal?.count ?? 0,
          processedLast24h: processedLast24h?.count ?? 0,
        },
        deadLetter: deadLetterStats,
      },
    });
  },
);
