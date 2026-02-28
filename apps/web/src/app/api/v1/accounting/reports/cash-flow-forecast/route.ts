import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getCashFlowForecast } from '@oppsera/module-accounting';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const days = url.searchParams.get('days');

    const report = await getCashFlowForecast({
      tenantId: ctx.tenantId,
      days: days ? parseInt(days, 10) : undefined,
      locationId: url.searchParams.get('locationId') ?? undefined,
    });

    return NextResponse.json({ data: report });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
