import { NextResponse } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  PMS_PERMISSIONS,
  calendarMoveSchema,
  moveReservation,
} from '@oppsera/module-pms';

export const POST = withMiddleware(
  async (request, ctx) => {
    const body = await request.json();
    const parsed = calendarMoveSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })));
    }
    const result = await moveReservation(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { permission: PMS_PERMISSIONS.CALENDAR_MOVE, entitlement: 'pms' },
);
