import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getGlDetailReport } from '@oppsera/module-accounting';

// GET /api/v1/accounting/reports/detail — GL detail report for a specific account
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const accountId = url.searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'accountId is required' } },
        { status: 400 },
      );
    }

    const limitParam = url.searchParams.get('limit');

    const result = await getGlDetailReport({
      tenantId: ctx.tenantId,
      accountId,
      startDate: url.searchParams.get('startDate') ?? undefined,
      endDate: url.searchParams.get('endDate') ?? undefined,
      locationId: url.searchParams.get('locationId') ?? undefined,
      profitCenterId: url.searchParams.get('profitCenterId') ?? undefined,
      subDepartmentId: url.searchParams.get('subDepartmentId') ?? undefined,
      terminalId: url.searchParams.get('terminalId') ?? undefined,
      channel: url.searchParams.get('channel') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: limitParam ? Math.min(parseInt(limitParam, 10), 1000) : undefined,
    });

    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
