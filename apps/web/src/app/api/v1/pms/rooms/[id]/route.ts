import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getRoom,
  updateRoom,
  updateRoomSchema,
} from '@oppsera/module-pms';

function extractId(request: NextRequest): string {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const roomsIndex = pathParts.indexOf('rooms');
  return pathParts[roomsIndex + 1]!;
}

// GET /api/v1/pms/rooms/:id — get room detail
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const result = await getRoom(ctx.tenantId, id);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pms', permission: 'pms.rooms.view' },
);

// PATCH /api/v1/pms/rooms/:id — update room
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const body = await request.json();
    const parsed = updateRoomSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await updateRoom(ctx, id, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pms', permission: 'pms.rooms.manage' , writeAccess: true },
);
