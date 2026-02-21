import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { getKitchenPerformance, getKitchenPerformanceSchema } from '@oppsera/module-fnb';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = request.nextUrl;
    const parsed = getKitchenPerformanceSchema.safeParse({
      tenantId: ctx.tenantId,
      locationId: url.searchParams.get('locationId') ?? '',
      startDate: url.searchParams.get('startDate') ?? '',
      endDate: url.searchParams.get('endDate') ?? '',
      stationId: url.searchParams.get('stationId') || undefined,
    });
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
    }
    const result = await getKitchenPerformance(parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.reports.view' },
);
