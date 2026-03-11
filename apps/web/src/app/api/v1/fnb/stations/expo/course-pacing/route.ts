import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { getExpoCoursePacing, getKdsLocationMetricsSchema } from '@oppsera/module-fnb';

// GET /api/v1/fnb/stations/expo/course-pacing?businessDate=YYYY-MM-DD
// Course pacing view for expo — per-table course progression
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

    const pacing = await getExpoCoursePacing(parsed.data);
    return NextResponse.json({ data: pacing });
  },
  { entitlement: 'kds', permission: 'kds.view' },
);
