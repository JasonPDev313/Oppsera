import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getSpaDashboard } from '@oppsera/module-spa';

// GET /api/v1/spa/dashboard — spa manager dashboard metrics for a single date
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get('locationId');
    const date = searchParams.get('date');

    if (!locationId || !date) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'locationId and date are required' } },
        { status: 400 },
      );
    }

    const data = await getSpaDashboard({
      tenantId: ctx.tenantId,
      locationId,
      date,
    });

    return NextResponse.json({ data });
  },
  { entitlement: 'spa', permission: 'spa.view' },
);
