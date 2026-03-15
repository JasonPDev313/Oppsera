import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { broadcastFnb } from '@oppsera/core/realtime';
import { ValidationError } from '@oppsera/shared';
import { listKitchenTickets, createKitchenTicket, createKitchenTicketSchema, resolveKdsLocationId } from '@oppsera/module-fnb';
import { parseLimit } from '@/lib/api-params';

// GET /api/v1/fnb/kitchen/tickets — list kitchen tickets
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const rawLocationId = ctx.locationId ?? url.searchParams.get('locationId') ?? '';
    let effectiveLocationId = rawLocationId;
    if (rawLocationId) {
      const kdsLoc = await resolveKdsLocationId(ctx.tenantId, rawLocationId);
      effectiveLocationId = kdsLoc.locationId;
    }
    const result = await listKitchenTickets({
      tenantId: ctx.tenantId,
      locationId: effectiveLocationId,
      businessDate: url.searchParams.get('businessDate') ?? '',
      status: (url.searchParams.get('status') as any) ?? undefined,
      tabId: url.searchParams.get('tabId') ?? undefined,
      stationId: url.searchParams.get('stationId') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: parseLimit(url.searchParams.get('limit')),
    });
    return NextResponse.json({ data: result.items, meta: { cursor: result.cursor, hasMore: result.hasMore } });
  },
  { entitlement: 'kds', permission: 'kds.view' },
);

// POST /api/v1/fnb/kitchen/tickets — create kitchen ticket
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = createKitchenTicketSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const ticket = await createKitchenTicket(ctx, parsed.data);
    broadcastFnb(ctx, 'kds').catch(() => {});
    return NextResponse.json({ data: ticket }, { status: 201 });
  },
  { entitlement: 'kds', permission: 'kds.manage', writeAccess: true },
);
