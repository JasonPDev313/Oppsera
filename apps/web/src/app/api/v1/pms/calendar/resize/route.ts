import { NextResponse } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  PMS_PERMISSIONS,
  calendarResizeSchema,
  resizeReservation,
} from '@oppsera/module-pms';

export const POST = withMiddleware(
  async (request, ctx) => {
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = calendarResizeSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })));
    }
    const result = await resizeReservation(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { permission: PMS_PERMISSIONS.CALENDAR_RESIZE, entitlement: 'pms' , writeAccess: true },
);
