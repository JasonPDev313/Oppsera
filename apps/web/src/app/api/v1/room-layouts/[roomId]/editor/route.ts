import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getRoomForEditor } from '@oppsera/module-room-layouts';

function extractRoomId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // /api/v1/room-layouts/:roomId/editor
  return parts[parts.length - 2]!;
}

// GET /api/v1/room-layouts/:roomId/editor — editor data with snapshot
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const roomId = extractRoomId(request);
    const data = await getRoomForEditor(ctx.tenantId, roomId);
    return NextResponse.json({ data });
  },
  { entitlement: 'room_layouts', permission: 'room_layouts.view' },
);
