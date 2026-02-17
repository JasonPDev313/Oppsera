import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getEventBus } from '@oppsera/core/events';
import type { InMemoryEventBus } from '@oppsera/core/events';

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    if (!ctx.isPlatformAdmin) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Platform admin access required' } },
        { status: 403 },
      );
    }

    const segments = new URL(request.url).pathname.split('/');
    const eventIdIdx = segments.indexOf('dlq') + 1;
    const eventId = segments[eventIdIdx];

    if (!eventId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'eventId is required' } },
        { status: 400 },
      );
    }

    const bus = getEventBus() as InMemoryEventBus;
    const dlq = typeof bus.getDeadLetterQueue === 'function'
      ? bus.getDeadLetterQueue()
      : [];

    const entry = dlq.find((e) => e.event.eventId === eventId);
    if (!entry) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Event not found in dead letter queue' } },
        { status: 404 },
      );
    }

    try {
      await bus.publish(entry.event);

      // Remove from DLQ on successful retry
      const currentDlq = bus.getDeadLetterQueue();
      const idx = currentDlq.findIndex((e) => e.event.eventId === eventId);
      if (idx >= 0) {
        currentDlq.splice(idx, 1);
      }

      return NextResponse.json({
        data: { message: 'Event retried successfully', eventId },
      });
    } catch (error) {
      return NextResponse.json(
        {
          error: {
            code: 'RETRY_FAILED',
            message: error instanceof Error ? error.message : 'Retry failed',
          },
        },
        { status: 500 },
      );
    }
  },
);
