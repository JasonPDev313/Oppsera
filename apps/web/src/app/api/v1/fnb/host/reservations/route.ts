import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getReservations,
  createReservation,
  createReservationSchema,
} from '@oppsera/module-fnb';

export const GET = withMiddleware(
  async (req: NextRequest, ctx: any) => {
    const url = new URL(req.url);
    const locationId = url.searchParams.get('locationId') || ctx.locationId;
    const reservationDate = url.searchParams.get('reservationDate') || undefined;
    const status = url.searchParams.get('status') || undefined;
    const statusesParam = url.searchParams.get('statuses') || undefined;
    const statuses = statusesParam ? statusesParam.split(',') : undefined;
    const startDate = url.searchParams.get('startDate') || undefined;
    const endDate = url.searchParams.get('endDate') || undefined;

    const result = await getReservations({
      tenantId: ctx.tenantId,
      locationId,
      reservationDate,
      status,
      statuses,
      startDate,
      endDate,
    });

    return NextResponse.json({
      data: result.items,
      meta: { totalCount: result.totalCount },
    });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.floor_plan.view' },
);

export const POST = withMiddleware(
  async (req: NextRequest, ctx: any) => {
    const body = await req.json();
    const parsed = createReservationSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid reservation input',
        parsed.error.issues,
      );
    }

    const result = await createReservation(ctx, parsed.data);

    return NextResponse.json({ data: result }, { status: 201 });
  },
  {
    entitlement: 'pos_fnb',
    permission: 'pos_fnb.floor_plan.manage',
    writeAccess: true,
  },
);
