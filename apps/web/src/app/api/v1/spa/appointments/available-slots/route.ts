import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getAvailableSlotsQuery as getAvailableSlots } from '@oppsera/module-spa';

// GET /api/v1/spa/appointments/available-slots — get available appointment slots
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);
    const serviceId = searchParams.get('serviceId');
    const providerId = searchParams.get('providerId') ?? undefined;
    const locationId = searchParams.get('locationId');
    const date = searchParams.get('date');

    if (!serviceId || !locationId || !date) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'serviceId, locationId, and date are required' } },
        { status: 400 },
      );
    }

    const slots = await getAvailableSlots({
      tenantId: ctx.tenantId,
      serviceId,
      providerId,
      locationId,
      date,
    });

    return NextResponse.json({ data: slots });
  },
  { entitlement: 'spa', permission: 'spa.appointments.view' },
);
