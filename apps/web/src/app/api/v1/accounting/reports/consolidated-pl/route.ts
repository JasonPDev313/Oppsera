import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getConsolidatedPL } from '@oppsera/module-accounting';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const locationIdsParam = url.searchParams.get('locationIds');

    if (!from || !to) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'from and to are required' } },
        { status: 400 },
      );
    }

    const locationIds = locationIdsParam
      ? locationIdsParam.split(',').filter(Boolean)
      : undefined;

    const report = await getConsolidatedPL({
      tenantId: ctx.tenantId,
      from,
      to,
      locationIds,
    });

    return NextResponse.json({ data: report });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
