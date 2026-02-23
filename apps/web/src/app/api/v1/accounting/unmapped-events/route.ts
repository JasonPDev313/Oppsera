import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { listUnmappedEvents } from '@oppsera/module-accounting';

// GET /api/v1/accounting/unmapped-events — list unmapped GL events
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');

    const result = await listUnmappedEvents({
      tenantId: ctx.tenantId,
      eventType: url.searchParams.get('eventType') ?? undefined,
      resolved: url.searchParams.has('resolved')
        ? url.searchParams.get('resolved') === 'true'
        : undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: limitParam ? Math.min(parseInt(limitParam, 10), 100) : undefined,
    });

    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
