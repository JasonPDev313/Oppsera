import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { getKdsLocationMetrics, getKdsLocationMetricsSchema } from '@oppsera/module-fnb';

// GET /api/v1/fnb/kds/location-metrics?businessDate=YYYY-MM-DD
// Aggregate KDS metrics across all stations for a location
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const businessDate = url.searchParams.get('businessDate') ?? '';
    const locationId = ctx.locationId ?? url.searchParams.get('locationId') ?? '';

    const parsed = getKdsLocationMetricsSchema.safeParse({ tenantId: ctx.tenantId, locationId, businessDate });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const metrics = await getKdsLocationMetrics(parsed.data);
    return NextResponse.json({ data: metrics });
  },
  { entitlement: 'kds', permission: 'kds.view' },
);
