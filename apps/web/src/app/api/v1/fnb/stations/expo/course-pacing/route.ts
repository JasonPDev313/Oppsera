import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getExpoCoursePacing } from '@oppsera/module-fnb';

// GET /api/v1/fnb/stations/expo/course-pacing?businessDate=YYYY-MM-DD
// Course pacing view for expo — per-table course progression
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const input = {
      tenantId: ctx.tenantId,
      locationId: ctx.locationId!, // guaranteed by requireLocation: true
      businessDate: request.nextUrl.searchParams.get('businessDate') || new Date().toISOString().slice(0, 10),
    };
    const pacing = await getExpoCoursePacing(input);
    return NextResponse.json({ data: pacing });
  },
  { entitlement: 'kds', permission: 'kds.view', requireLocation: true },
);
