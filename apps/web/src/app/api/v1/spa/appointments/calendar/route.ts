import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getAppointmentsForCalendar } from '@oppsera/module-spa';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const locationId = searchParams.get('locationId');
    const providerIdsParam = searchParams.get('providerIds');

    if (!startDate || !endDate || !locationId) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'startDate, endDate, and locationId are required' } },
        { status: 400 },
      );
    }

    const result = await getAppointmentsForCalendar({
      tenantId: ctx.tenantId,
      locationId,
      startDate,
      endDate,
      providerIds: providerIdsParam ? providerIdsParam.split(',') : undefined,
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'spa', permission: 'spa.appointments.view' },
);
