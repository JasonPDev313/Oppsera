import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { broadcastFnb } from '@oppsera/core/realtime';
import { ValidationError } from '@oppsera/shared';
import { getExpoView, getExpoViewSchema, bumpTicket, bumpTicketSchema } from '@oppsera/module-fnb';

// GET /api/v1/fnb/stations/expo — get expo view (all stations)
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);

    const parsed = getExpoViewSchema.safeParse({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId ?? url.searchParams.get('locationId') ?? '',
      businessDate: url.searchParams.get('businessDate') ?? '',
    });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const view = await getExpoView(parsed.data);
    return NextResponse.json({ data: view });
  },
  { entitlement: 'kds', permission: 'kds.view' },
);

// POST /api/v1/fnb/stations/expo — bump ticket from expo view
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    // Explicitly omit stationId — expo bumps must always resolve as expo (→ served).
    // Without this, a caller could inject a prep stationId and get a 'ready' bump.
    const { stationId: _stripped, ...safeBody } = body;
    const parsed = bumpTicketSchema.safeParse({
      ...safeBody,
      clientRequestId: safeBody.clientRequestId ?? `expo-bump-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await bumpTicket(ctx, parsed.data);
    broadcastFnb(ctx, 'kds').catch(() => {});
    return NextResponse.json({ data: result });
  },
  { entitlement: 'kds', permission: 'kds.bump', writeAccess: true },
);
