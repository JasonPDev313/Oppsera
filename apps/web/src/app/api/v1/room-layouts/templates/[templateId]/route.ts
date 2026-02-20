import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getTemplate, updateTemplate, deleteTemplate } from '@oppsera/module-room-layouts';

function extractTemplateId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 1]!;
}

// GET /api/v1/room-layouts/templates/:templateId
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const templateId = extractTemplateId(request);
    const template = await getTemplate(ctx.tenantId, templateId);
    return NextResponse.json({ data: template });
  },
  { entitlement: 'room_layouts', permission: 'room_layouts.view' },
);

// PATCH /api/v1/room-layouts/templates/:templateId
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const templateId = extractTemplateId(request);
    const body = await request.json();
    const template = await updateTemplate(ctx, templateId, body);
    return NextResponse.json({ data: template });
  },
  { entitlement: 'room_layouts', permission: 'room_layouts.manage' },
);

// DELETE /api/v1/room-layouts/templates/:templateId — soft delete
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const templateId = extractTemplateId(request);
    await deleteTemplate(ctx, templateId);
    return NextResponse.json({ data: { success: true } });
  },
  { entitlement: 'room_layouts', permission: 'room_layouts.manage' },
);
