import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  getRoomSuggestions,
  PMS_PERMISSIONS,
} from '@oppsera/module-pms';

// GET /api/v1/pms/reservations/[id]/room-suggestions
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    const reservationId = segments[segments.length - 2]!;

    const data = await getRoomSuggestions(ctx.tenantId, reservationId);
    return NextResponse.json({ data });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.ASSIGNMENT_VIEW },
);
