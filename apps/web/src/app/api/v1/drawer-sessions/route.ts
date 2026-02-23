import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  openDrawerSession,
  openDrawerSessionSchema,
  getActiveDrawerSession,
  getDrawerSessionHistory,
} from '@oppsera/core/drawer-sessions';

// GET /api/v1/drawer-sessions
// Query params: terminalId (required for ?active=true), locationId, dateFrom, dateTo, status, cursor, limit
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const terminalId = url.searchParams.get('terminalId') ?? undefined;
    const active = url.searchParams.get('active') === 'true';

    // If requesting active session, return single
    if (active && terminalId) {
      const session = await getActiveDrawerSession({
        tenantId: ctx.tenantId,
        terminalId,
      });
      return NextResponse.json({ data: session });
    }

    // Otherwise return history
    const result = await getDrawerSessionHistory({
      tenantId: ctx.tenantId,
      terminalId,
      locationId: url.searchParams.get('locationId') ?? undefined,
      dateFrom: url.searchParams.get('dateFrom') ?? undefined,
      dateTo: url.searchParams.get('dateTo') ?? undefined,
      status: (url.searchParams.get('status') as 'open' | 'closed') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined,
    });

    return NextResponse.json({ data: result.items, meta: { cursor: result.cursor, hasMore: result.hasMore } });
  },
  { entitlement: 'orders', permission: 'shift.manage' },
);

// POST /api/v1/drawer-sessions — Open a new drawer session
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = openDrawerSessionSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const session = await openDrawerSession(ctx, parsed.data);
    return NextResponse.json({ data: session }, { status: 201 });
  },
  { entitlement: 'orders', permission: 'shift.manage' , writeAccess: true },
);
