import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { listTenders } from '@oppsera/module-payments';
import { parseLimit } from '@/lib/api-params';

// GET /api/v1/tenders — list tenders with filters
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const result = await listTenders({
      tenantId: ctx.tenantId,
      locationId: url.searchParams.get('locationId') ?? ctx.locationId ?? undefined,
      businessDate: url.searchParams.get('businessDate') ?? undefined,
      tenderType: url.searchParams.get('tenderType') ?? undefined,
      employeeId: url.searchParams.get('employeeId') ?? undefined,
      terminalId: url.searchParams.get('terminalId') ?? undefined,
      shiftId: url.searchParams.get('shiftId') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: parseLimit(url.searchParams.get('limit')),
    });
    return NextResponse.json({
      data: result.tenders,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'payments', permission: 'tenders.view' },
);
