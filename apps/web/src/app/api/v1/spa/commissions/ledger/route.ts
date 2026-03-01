import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { listCommissionLedger } from '@oppsera/module-spa';

// GET /api/v1/spa/commissions/ledger — list commission ledger entries with cursor pagination
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);

    const providerId = searchParams.get('providerId') ?? undefined;
    const status = searchParams.get('status') ?? undefined;
    const payPeriod = searchParams.get('payPeriod') ?? undefined;
    const appointmentId = searchParams.get('appointmentId') ?? undefined;
    const cursor = searchParams.get('cursor') ?? undefined;
    const limitParam = searchParams.get('limit');

    const result = await listCommissionLedger({
      tenantId: ctx.tenantId,
      providerId,
      status,
      payPeriod,
      appointmentId,
      cursor,
      limit: limitParam ? parseInt(limitParam, 10) : undefined,
    });

    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'spa', permission: 'spa.commissions.view' },
);
