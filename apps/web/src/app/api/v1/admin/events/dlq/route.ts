import { NextResponse } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getEventBus } from '@oppsera/core/events';
import type { InMemoryEventBus } from '@oppsera/core/events';

export const GET = withMiddleware(
  async (_request, ctx) => {
    if (!ctx.isPlatformAdmin) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Platform admin access required' } },
        { status: 403 },
      );
    }

    const bus = getEventBus() as InMemoryEventBus;
    const dlq = typeof bus.getDeadLetterQueue === 'function'
      ? bus.getDeadLetterQueue()
      : [];

    const items = dlq.map((entry) => ({
      eventId: entry.event.eventId,
      eventType: entry.event.eventType,
      tenantId: entry.event.tenantId,
      error: entry.error.message,
      failedAt: entry.failedAt,
      data: entry.event.data,
    }));

    return NextResponse.json({ data: { deadLetterQueue: items } });
  },
);
