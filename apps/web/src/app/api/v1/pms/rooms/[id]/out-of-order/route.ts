import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  setRoomOutOfOrder,
  clearRoomOutOfOrder,
  setOutOfOrderSchema,
} from '@oppsera/module-pms';

function extractRoomId(request: NextRequest): string {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const roomsIndex = pathParts.indexOf('rooms');
  return pathParts[roomsIndex + 1]!;
}

// POST /api/v1/pms/rooms/:id/out-of-order — set room out of order
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const roomId = extractRoomId(request);
    const body = await request.json();
    const parsed = setOutOfOrderSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await setRoomOutOfOrder(ctx, roomId, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pms', permission: 'pms.rooms.manage' },
);

// DELETE /api/v1/pms/rooms/:id/out-of-order — clear room out of order
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const roomId = extractRoomId(request);
    const result = await clearRoomOutOfOrder(ctx, roomId);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pms', permission: 'pms.rooms.manage' },
);
