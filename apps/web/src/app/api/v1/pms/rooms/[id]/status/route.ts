import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  updateRoomHousekeeping,
  updateRoomHousekeepingSchema,
} from '@oppsera/module-pms';

function extractRoomId(request: NextRequest): string {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const roomsIndex = pathParts.indexOf('rooms');
  return pathParts[roomsIndex + 1]!;
}

// POST /api/v1/pms/rooms/:id/status — update room housekeeping status
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const roomId = extractRoomId(request);
    const body = await request.json();
    const parsed = updateRoomHousekeepingSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await updateRoomHousekeeping(ctx, roomId, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pms', permission: 'pms.housekeeping.manage' , writeAccess: true },
);
