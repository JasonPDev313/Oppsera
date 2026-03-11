import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { saveDraft, saveDraftSchema } from '@oppsera/module-room-layouts';

function extractRoomId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // /api/v1/room-layouts/:roomId/draft
  return parts[parts.length - 2]!;
}

// PUT /api/v1/room-layouts/:roomId/draft — save/autosave draft
export const PUT = withMiddleware(
  async (request: NextRequest, ctx) => {
    const roomId = extractRoomId(request);
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = saveDraftSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const version = await saveDraft(ctx, roomId, parsed.data);
    return NextResponse.json({ data: version });
  },
  { entitlement: 'room_layouts', permission: 'room_layouts.manage' , writeAccess: true },
);
