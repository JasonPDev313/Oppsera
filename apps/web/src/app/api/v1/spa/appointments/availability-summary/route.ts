import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getAvailabilitySummary } from '@oppsera/module-spa';

// GET /api/v1/spa/appointments/availability-summary
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get('locationId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const categoryId = searchParams.get('categoryId') ?? undefined;

    if (!locationId || !startDate || !endDate) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'locationId, startDate, and endDate are required' } },
        { status: 400 },
      );
    }

    const result = await getAvailabilitySummary({
      tenantId: ctx.tenantId,
      locationId,
      startDate,
      endDate,
      categoryId,
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'spa', permission: 'spa.appointments.view' },
);
