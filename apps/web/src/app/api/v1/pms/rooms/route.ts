import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listRooms,
  createRoom,
  createRoomSchema,
} from '@oppsera/module-pms';

// GET /api/v1/pms/rooms — list rooms (requires ?propertyId=, optional ?status=&roomTypeId=)
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const propertyId = url.searchParams.get('propertyId');

    if (!propertyId) {
      throw new ValidationError('propertyId is required', [
        { field: 'propertyId', message: 'propertyId query parameter is required' },
      ]);
    }

    const limitParam = url.searchParams.get('limit');

    const result = await listRooms({
      tenantId: ctx.tenantId,
      propertyId,
      status: url.searchParams.get('status') ?? undefined,
      roomTypeId: url.searchParams.get('roomTypeId') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: limitParam ? Math.min(parseInt(limitParam, 10), 100) : undefined,
    });

    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'pms', permission: 'pms.rooms.view' },
);

// POST /api/v1/pms/rooms — create room
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

    const result = await createRoom(ctx, parsed.data);

    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pms', permission: 'pms.rooms.manage' , writeAccess: true },
);
