import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  startRetailClose,
  startRetailCloseSchema,
  listRetailCloseBatches,
  getRetailCloseBatchByTerminalDate,
} from '@oppsera/core/retail-close';

// GET /api/v1/retail-close — List batches or get by terminal+date
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const terminalId = url.searchParams.get('terminalId');
    const businessDate = url.searchParams.get('businessDate');

    // If terminal + date specified, return single batch
    if (terminalId && businessDate) {
      const batch = await getRetailCloseBatchByTerminalDate({
        tenantId: ctx.tenantId,
        terminalId,
        businessDate,
      });
      return NextResponse.json({ data: batch });
    }

    // Otherwise list with filters
    const result = await listRetailCloseBatches({
      tenantId: ctx.tenantId,
      locationId: url.searchParams.get('locationId') ?? undefined,
      terminalId: terminalId ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
      dateFrom: url.searchParams.get('dateFrom') ?? undefined,
      dateTo: url.searchParams.get('dateTo') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined,
    });

    return NextResponse.json({ data: result.items, meta: { cursor: result.cursor, hasMore: result.hasMore } });
  },
  { entitlement: 'orders', permission: 'shift.manage' },
);

// POST /api/v1/retail-close — Start a retail close batch
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = startRetailCloseSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const batch = await startRetailClose(ctx, parsed.data);
    return NextResponse.json({ data: batch }, { status: 201 });
  },
  { entitlement: 'orders', permission: 'shift.manage' , writeAccess: true },
);
