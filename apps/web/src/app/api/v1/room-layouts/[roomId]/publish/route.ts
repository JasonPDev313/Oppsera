import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { publishVersion, publishVersionSchema } from '@oppsera/module-room-layouts';

function extractRoomId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // /api/v1/room-layouts/:roomId/publish
  return parts[parts.length - 2]!;
}

// POST /api/v1/room-layouts/:roomId/publish — publish current draft
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const roomId = extractRoomId(request);
    const body = await request.json().catch(() => ({}));
    const parsed = publishVersionSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const version = await publishVersion(ctx, roomId, parsed.data);
    return NextResponse.json({ data: version });
  },
  { entitlement: 'room_layouts', permission: 'room_layouts.manage' },
);
