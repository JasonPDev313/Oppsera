import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { requirePermission } from '@oppsera/core/permissions';
import { ValidationError } from '@oppsera/shared';
import {
  PMS_PERMISSIONS,
  checkInSchema,
  checkIn,
  checkOutSchema,
  checkOut,
  cancelReservationSchema,
  cancelReservation,
  markNoShowSchema,
  markNoShow,
  moveRoomSchema,
  moveRoom,
} from '@oppsera/module-pms';

const ACTIONS: Record<string, true> = {
  'check-in': true,
  'check-out': true,
  cancel: true,
  'no-show': true,
  'move-room': true,
};

const ACTION_PERMISSIONS: Record<string, string> = {
  'check-in': PMS_PERMISSIONS.FRONT_DESK_CHECK_IN,
  'check-out': PMS_PERMISSIONS.FRONT_DESK_CHECK_OUT,
  cancel: PMS_PERMISSIONS.RESERVATIONS_CANCEL,
  'no-show': PMS_PERMISSIONS.FRONT_DESK_NO_SHOW,
  'move-room': PMS_PERMISSIONS.FRONT_DESK_CHECK_IN,
};

function extractId(request: NextRequest): string {
  const parts = request.nextUrl.pathname.split('/');
  return parts[parts.length - 2]!;
}

function extractAction(request: NextRequest): string {
  return request.nextUrl.pathname.split('/').at(-1)!;
}

// POST /api/v1/pms/reservations/:id/:action
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const action = extractAction(request);
    if (!ACTIONS[action]) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Unknown action: ${action}` } },
        { status: 404 },
      );
    }

    // Per-action permission check
    await requirePermission(ACTION_PERMISSIONS[action]!)(ctx);

    const id = extractId(request);
    const body = await request.json();

    switch (action) {
      case 'check-in': {
        const parsed = checkInSchema.safeParse(body);
        if (!parsed.success) {
          throw new ValidationError('Validation failed', parsed.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })));
        }
        const result = await checkIn(ctx, id, parsed.data);
        return NextResponse.json({ data: result });
      }

      case 'check-out': {
        const parsed = checkOutSchema.safeParse(body);
        if (!parsed.success) {
          throw new ValidationError('Validation failed', parsed.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })));
        }
        const result = await checkOut(ctx, id, parsed.data);
        return NextResponse.json({ data: result });
      }

      case 'cancel': {
        const parsed = cancelReservationSchema.safeParse(body);
        if (!parsed.success) {
          throw new ValidationError('Validation failed', parsed.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })));
        }
        const result = await cancelReservation(ctx, id, parsed.data);
        return NextResponse.json({ data: result });
      }

      case 'no-show': {
        const parsed = markNoShowSchema.safeParse(body);
        if (!parsed.success) {
          throw new ValidationError('Validation failed', parsed.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })));
        }
        const result = await markNoShow(ctx, id, parsed.data);
        return NextResponse.json({ data: result });
      }

      case 'move-room': {
        const parsed = moveRoomSchema.safeParse(body);
        if (!parsed.success) {
          throw new ValidationError('Validation failed', parsed.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })));
        }
        const result = await moveRoom(ctx, id, parsed.data);
        return NextResponse.json({ data: result });
      }
    }
  },
  { entitlement: 'pms', writeAccess: true },
);
