import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { broadcastFnb } from '@oppsera/core/realtime';
import { ValidationError } from '@oppsera/shared';
import { getExpoView, bumpTicket, bumpTicketSchema } from '@oppsera/module-fnb';

// GET /api/v1/fnb/stations/expo — get expo view (all stations)
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const input = {
      tenantId: ctx.tenantId,
      locationId: ctx.locationId!, // guaranteed by requireLocation: true
      businessDate: request.nextUrl.searchParams.get('businessDate') || new Date().toISOString().slice(0, 10),
    };
    const view = await getExpoView(input);
    return NextResponse.json({ data: view });
  },
  { entitlement: 'kds', permission: 'kds.view', requireLocation: true },
);

// POST /api/v1/fnb/stations/expo — bump ticket from expo view
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    let body: Record<string, unknown> = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
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
