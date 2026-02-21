import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { duplicateRoom } from '@oppsera/module-room-layouts';

function extractRoomId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // /api/v1/room-layouts/:roomId/duplicate
  return parts[parts.length - 2]!;
}

// POST /api/v1/room-layouts/:roomId/duplicate — clone room
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const roomId = extractRoomId(request);
    const body = await request.json();

    if (!body.name || typeof body.name !== 'string') {
      throw new ValidationError('name is required');
    }

    const room = await duplicateRoom(ctx, roomId, {
      name: body.name,
      locationId: body.locationId ?? undefined,
    });

    return NextResponse.json({ data: room }, { status: 201 });
  },
  { entitlement: 'room_layouts', permission: 'room_layouts.manage' },
);
