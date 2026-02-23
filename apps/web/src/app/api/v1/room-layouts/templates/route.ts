import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { listTemplates, createTemplate, createTemplateSchema } from '@oppsera/module-room-layouts';

// GET /api/v1/room-layouts/templates — list templates
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const result = await listTemplates({
      tenantId: ctx.tenantId,
      category: url.searchParams.get('category') ?? undefined,
      search: url.searchParams.get('search') ?? undefined,
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

// POST /api/v1/room-layouts/templates — create template
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createTemplateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const template = await createTemplate(ctx, parsed.data);
    return NextResponse.json({ data: template }, { status: 201 });
  },
  { entitlement: 'room_layouts', permission: 'room_layouts.manage' , writeAccess: true },
);
