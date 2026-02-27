import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { getExpoView, bumpTicket, bumpTicketSchema } from '@oppsera/module-fnb';

// GET /api/v1/fnb/stations/expo — get expo view (all stations)
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);

    const view = await getExpoView({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId ?? url.searchParams.get('locationId') ?? '',
      businessDate: url.searchParams.get('businessDate') ?? '',
    });
    return NextResponse.json({ data: view });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.kds.view' },
);

// POST /api/v1/fnb/stations/expo — bump ticket from expo view
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = bumpTicketSchema.safeParse({
      ...body,
      clientRequestId: body.clientRequestId ?? `expo-bump-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await bumpTicket(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.kds.manage', writeAccess: true },
);
