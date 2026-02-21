import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { listKitchenTickets, createKitchenTicket, createKitchenTicketSchema } from '@oppsera/module-fnb';

// GET /api/v1/fnb/kitchen/tickets — list kitchen tickets
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const result = await listKitchenTickets({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId ?? url.searchParams.get('locationId') ?? '',
      businessDate: url.searchParams.get('businessDate') ?? '',
      status: (url.searchParams.get('status') as any) ?? undefined,
      tabId: url.searchParams.get('tabId') ?? undefined,
      stationId: url.searchParams.get('stationId') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined,
    });
    return NextResponse.json({ data: result.items, meta: { cursor: result.cursor, hasMore: result.hasMore } });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.kds.view' },
);

// POST /api/v1/fnb/kitchen/tickets — create kitchen ticket
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createKitchenTicketSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const ticket = await createKitchenTicket(ctx, parsed.data);
    return NextResponse.json({ data: ticket }, { status: 201 });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.kds.manage' },
);
