import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { getFnbDashboard, getFnbDashboardSchema } from '@oppsera/module-fnb';

// GET /api/v1/fnb/reports/dashboard — get F&B dashboard metrics
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = request.nextUrl;
    const parsed = getFnbDashboardSchema.safeParse({
      tenantId: ctx.tenantId,
      locationId: url.searchParams.get('locationId') ?? ctx.locationId ?? '',
      businessDate: url.searchParams.get('businessDate') ?? new Date().toISOString().slice(0, 10),
    });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await getFnbDashboard(parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.reports.view' },
);
