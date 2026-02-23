import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { retryDeadLetter, resolveDeadLetter, discardDeadLetter, getEventBus } from '@oppsera/core/events';

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

    const body = await request.json().catch(() => ({}));
    const action = (body as { action?: string }).action ?? 'retry';

    try {
      if (action === 'resolve') {
        await resolveDeadLetter(eventId, ctx.user.id, (body as { notes?: string }).notes);
        return NextResponse.json({
          data: { message: 'Dead letter resolved', eventId },
        });
      }

      if (action === 'discard') {
        await discardDeadLetter(eventId, ctx.user.id, (body as { notes?: string }).notes);
        return NextResponse.json({
          data: { message: 'Dead letter discarded', eventId },
        });
      }

      // Default: retry — needs the event bus to re-publish
      const bus = getEventBus();
      await retryDeadLetter(eventId, bus);
      return NextResponse.json({
        data: { message: 'Event retried successfully', eventId },
      });
    } catch (error) {
      return NextResponse.json(
        {
          error: {
            code: 'RETRY_FAILED',
            message: error instanceof Error ? error.message : 'Operation failed',
          },
        },
        { status: 500 },
      );
    }
  },
);
