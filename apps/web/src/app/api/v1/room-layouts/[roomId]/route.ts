import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { getRoom, updateRoom, archiveRoom, unarchiveRoom, updateRoomSchema } from '@oppsera/module-room-layouts';

function extractRoomId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // /api/v1/room-layouts/:roomId
  return parts[parts.length - 1]!;
}

// GET /api/v1/room-layouts/:roomId — room detail
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const roomId = extractRoomId(request);
    const room = await getRoom(ctx.tenantId, roomId);
    return NextResponse.json({ data: room });
  },
  { entitlement: 'room_layouts', permission: 'room_layouts.view' },
);

// PATCH /api/v1/room-layouts/:roomId — update room metadata
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const roomId = extractRoomId(request);
    const body = await request.json();
    const parsed = updateRoomSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const room = await updateRoom(ctx, roomId, parsed.data);
    return NextResponse.json({ data: room });
  },
  { entitlement: 'room_layouts', permission: 'room_layouts.manage' },
);

// DELETE /api/v1/room-layouts/:roomId — archive room
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const roomId = extractRoomId(request);
    const url = new URL(request.url);
    const restore = url.searchParams.get('restore') === 'true';

    if (restore) {
      const room = await unarchiveRoom(ctx, roomId);
      return NextResponse.json({ data: room });
    }

    const reason = url.searchParams.get('reason') ?? undefined;
    const room = await archiveRoom(ctx, roomId, reason);
    return NextResponse.json({ data: room });
  },
  { entitlement: 'room_layouts', permission: 'room_layouts.manage' },
);
