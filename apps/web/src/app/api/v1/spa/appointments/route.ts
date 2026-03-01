import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listAppointments,
  createAppointment,
  createAppointmentSchema,
} from '@oppsera/module-spa';

// GET /api/v1/spa/appointments — list appointments with cursor pagination
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);

    const statusParam = searchParams.get('status') ?? undefined;
    const providerId = searchParams.get('providerId') ?? undefined;
    const customerId = searchParams.get('customerId') ?? undefined;
    const locationId = searchParams.get('locationId') ?? undefined;
    const startDate = searchParams.get('startDate') ?? undefined;
    const endDate = searchParams.get('endDate') ?? undefined;
    const cursor = searchParams.get('cursor') ?? undefined;
    const limitParam = searchParams.get('limit');

    const result = await listAppointments({
      tenantId: ctx.tenantId,
      locationId,
      providerId,
      customerId,
      status: statusParam || undefined,
      startDate,
      endDate,
      cursor,
      limit: limitParam ? parseInt(limitParam, 10) : undefined,
    });

    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'spa', permission: 'spa.appointments.view' },
);

// POST /api/v1/spa/appointments — create a new appointment
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createAppointmentSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const appointment = await createAppointment(ctx, parsed.data);
    return NextResponse.json({ data: appointment }, { status: 201 });
  },
  { entitlement: 'spa', permission: 'spa.appointments.create', writeAccess: true },
);
