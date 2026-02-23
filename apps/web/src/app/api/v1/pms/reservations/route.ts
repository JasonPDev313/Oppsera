import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  PMS_PERMISSIONS,
  createReservationSchema,
  createReservation,
  listReservations,
} from '@oppsera/module-pms';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('propertyId');
    if (!propertyId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'propertyId is required' } },
        { status: 400 },
      );
    }
    const result = await listReservations({
      tenantId: ctx.tenantId,
      propertyId,
      status: searchParams.get('status') ?? undefined,
      fromDate: searchParams.get('startDate') ?? undefined,
      toDate: searchParams.get('endDate') ?? undefined,
      guestId: searchParams.get('guestId') ?? undefined,
      cursor: searchParams.get('cursor') ?? undefined,
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined,
    });
    return NextResponse.json({ data: result.items, meta: { cursor: result.cursor, hasMore: result.hasMore } });
  },
  { permission: PMS_PERMISSIONS.RESERVATIONS_VIEW, entitlement: 'pms' },
);

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createReservationSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })));
    }
    const result = await createReservation(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { permission: PMS_PERMISSIONS.RESERVATIONS_CREATE, entitlement: 'pms' , writeAccess: true },
);
