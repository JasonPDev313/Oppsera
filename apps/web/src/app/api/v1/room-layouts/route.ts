import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { listRooms, createRoom, createRoomSchema } from '@oppsera/module-room-layouts';

// GET /api/v1/room-layouts — list rooms
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const result = await listRooms({
      tenantId: ctx.tenantId,
      locationId: url.searchParams.get('locationId') ?? undefined,
      isActive: url.searchParams.has('isActive') ? url.searchParams.get('isActive') === 'true' : undefined,
      search: url.searchParams.get('search') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.has('limit') ? parseInt(url.searchParams.get('limit')!, 10) : undefined,
    });

    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'room_layouts', permission: 'room_layouts.view' },
);

// POST /api/v1/room-layouts — create room
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createRoomSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const room = await createRoom(ctx, parsed.data);
    return NextResponse.json({ data: room }, { status: 201 });
  },
  { entitlement: 'room_layouts', permission: 'room_layouts.manage' },
);
