import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { revertToVersion } from '@oppsera/module-room-layouts';

function extractRoomId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // /api/v1/room-layouts/:roomId/revert
  return parts[parts.length - 2]!;
}

// POST /api/v1/room-layouts/:roomId/revert — revert to version
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const roomId = extractRoomId(request);
    const body = await request.json();

    if (!body.versionId || typeof body.versionId !== 'string') {
      throw new ValidationError('versionId is required');
    }

    const version = await revertToVersion(ctx, roomId, body.versionId);
    return NextResponse.json({ data: version });
  },
  { entitlement: 'room_layouts', permission: 'room_layouts.manage' },
);
