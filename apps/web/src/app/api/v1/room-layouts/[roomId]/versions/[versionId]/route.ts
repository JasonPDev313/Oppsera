import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getVersion } from '@oppsera/module-room-layouts';

function extractIds(request: NextRequest): { roomId: string; versionId: string } {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // /api/v1/room-layouts/:roomId/versions/:versionId
  return {
    versionId: parts[parts.length - 1]!,
    roomId: parts[parts.length - 3]!,
  };
}

// GET /api/v1/room-layouts/:roomId/versions/:versionId — specific version
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { roomId, versionId } = extractIds(request);
    const version = await getVersion(ctx.tenantId, roomId, versionId);
    return NextResponse.json({ data: version });
  },
  { entitlement: 'room_layouts', permission: 'room_layouts.view' },
);
