import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { calculateAppointmentCommissions } from '@oppsera/module-spa';

// POST /api/v1/spa/commissions/calculate — calculate commissions for an appointment
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();

    if (!body.appointmentId || typeof body.appointmentId !== 'string') {
      throw new ValidationError('Validation failed', [
        { field: 'appointmentId', message: 'appointmentId is required' },
      ]);
    }

    const result = await calculateAppointmentCommissions(ctx, {
      appointmentId: body.appointmentId,
      orderId: body.orderId as string | undefined,
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'spa', permission: 'spa.commissions.manage', writeAccess: true },
);
