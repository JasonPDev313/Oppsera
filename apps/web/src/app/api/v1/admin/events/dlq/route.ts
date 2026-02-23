import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { listDeadLetters } from '@oppsera/core/events';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    if (!ctx.isPlatformAdmin) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Platform admin access required' } },
        { status: 403 },
      );
    }

    const url = new URL(request.url);
    const status = url.searchParams.get('status') ?? undefined;
    const eventType = url.searchParams.get('eventType') ?? undefined;
    const consumerName = url.searchParams.get('consumerName') ?? undefined;
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);

    const result = await listDeadLetters({
      tenantId: ctx.tenantId,
      status: status as 'failed' | 'retrying' | 'resolved' | 'discarded' | undefined,
      eventType,
      consumerName,
      cursor,
      limit,
    });

    return NextResponse.json({
      data: {
        deadLetterQueue: result.items,
      },
      meta: {
        cursor: result.cursor,
        hasMore: result.hasMore,
      },
    });
  },
);
