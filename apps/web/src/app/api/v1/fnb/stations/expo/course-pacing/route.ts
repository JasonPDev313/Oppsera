import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getExpoCoursePacing, resolveKdsLocationId } from '@oppsera/module-fnb';

// GET /api/v1/fnb/stations/expo/course-pacing?businessDate=YYYY-MM-DD
// Course pacing view for expo — per-table course progression
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const kdsLoc = await resolveKdsLocationId(ctx.tenantId, ctx.locationId!);
    const input = {
      tenantId: ctx.tenantId,
      locationId: kdsLoc.locationId,
      businessDate: request.nextUrl.searchParams.get('businessDate') || new Date().toISOString().slice(0, 10),
    };
    const pacing = await getExpoCoursePacing(input);
    return NextResponse.json({ data: pacing });
  },
  { entitlement: 'kds', permission: 'kds.view', requireLocation: true },
);
