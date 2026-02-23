import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getVersionHistory } from '@oppsera/module-room-layouts';

function extractRoomId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // /api/v1/room-layouts/:roomId/versions
  return parts[parts.length - 2]!;
}

// GET /api/v1/room-layouts/:roomId/versions — version history
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const roomId = extractRoomId(request);
    const url = new URL(request.url);

    const result = await getVersionHistory({
      tenantId: ctx.tenantId,
      roomId,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.has('limit') ? Math.min(parseInt(url.searchParams.get('limit')!, 10), 100) : undefined,
    });

    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'room_layouts', permission: 'room_layouts.view' },
);
