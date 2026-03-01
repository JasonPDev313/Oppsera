import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getAppointment,
  updateAppointment,
  updateAppointmentSchema,
} from '@oppsera/module-spa';

function extractId(url: string): string | null {
  return url.split('/appointments/')[1]?.split('/')[0]?.split('?')[0] ?? null;
}

// GET /api/v1/spa/appointments/[id] — get appointment detail
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request.url);
    if (!id) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Missing appointment ID' } },
        { status: 400 },
      );
    }

    const appointment = await getAppointment({ tenantId: ctx.tenantId, appointmentId: id });
    if (!appointment) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Appointment not found' } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: appointment });
  },
  { entitlement: 'spa', permission: 'spa.appointments.view' },
);

// PATCH /api/v1/spa/appointments/[id] — update appointment
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request.url);
    if (!id) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Missing appointment ID' } },
        { status: 400 },
      );
    }

    const body = await request.json();
    const parsed = updateAppointmentSchema.safeParse({ ...body, id });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const appointment = await updateAppointment(ctx, parsed.data);
    return NextResponse.json({ data: appointment });
  },
  { entitlement: 'spa', permission: 'spa.appointments.manage', writeAccess: true },
);
