import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { applyTemplate } from '@oppsera/module-room-layouts';

function extractTemplateId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // /api/v1/room-layouts/templates/:templateId/apply
  return parts[parts.length - 2]!;
}

// POST /api/v1/room-layouts/templates/:templateId/apply — apply template to room
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const templateId = extractTemplateId(request);
    const body = await request.json();

    if (!body.roomId || typeof body.roomId !== 'string') {
      throw new ValidationError('roomId is required');
    }

    const version = await applyTemplate(ctx, body.roomId, templateId);
    return NextResponse.json({ data: version });
  },
  { entitlement: 'room_layouts', permission: 'room_layouts.manage' , writeAccess: true },
);
