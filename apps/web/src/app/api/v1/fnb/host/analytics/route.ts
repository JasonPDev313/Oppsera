import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { getHostAnalytics, hostGetAnalyticsSchema } from '@oppsera/module-fnb';

export const GET = withMiddleware(
  async (req: NextRequest, ctx) => {
    const url = new URL(req.url);
    const input = {
      tenantId: ctx.tenantId,
      locationId: ctx.locationId || url.searchParams.get('locationId') || '',
      startDate: url.searchParams.get('startDate') || '',
      endDate: url.searchParams.get('endDate') || '',
      mealPeriod: url.searchParams.get('mealPeriod') || undefined,
    };
    const parsed = hostGetAnalyticsSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid input',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const data = await getHostAnalytics(parsed.data);
    return NextResponse.json({ data });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.host.analytics' },
);
