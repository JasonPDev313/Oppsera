import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getAppointmentsForCalendar } from '@oppsera/module-spa';

export const dynamic = 'force-dynamic';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const locationId = searchParams.get('locationId');
    const providerIdsParam = searchParams.get('providerIds');

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'startDate and endDate are required' } },
        { status: 400 },
      );
    }

    const result = await getAppointmentsForCalendar({
      tenantId: ctx.tenantId,
      locationId: locationId ?? undefined,
      startDate,
      endDate,
      providerIds: providerIdsParam ? providerIdsParam.split(',') : undefined,
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'spa', permission: 'spa.appointments.view' },
);
