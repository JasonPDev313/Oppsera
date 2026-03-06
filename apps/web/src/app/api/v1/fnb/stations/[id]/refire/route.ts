import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { broadcastFnb } from '@oppsera/core/realtime';
import { ValidationError } from '@oppsera/shared';
import { refireItem, refireItemSchema } from '@oppsera/module-fnb';

// POST /api/v1/fnb/stations/[id]/refire — re-fire (remake) an item
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    const refireIdx = segments.indexOf('refire');
    const stationId = refireIdx > 0 ? segments[refireIdx - 1] : undefined;

    const body = await request.json();
    const parsed = refireItemSchema.safeParse({ ...body, stationId });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const item = await refireItem(ctx, parsed.data);
    broadcastFnb(ctx, 'kds').catch(() => {});
    return NextResponse.json({ data: item });
  },
  { entitlement: 'kds', permission: 'kds.bump', writeAccess: true },
);
