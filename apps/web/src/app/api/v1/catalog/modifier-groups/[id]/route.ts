import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getModifierGroup,
  updateModifierGroup,
  updateModifierGroupSchema,
} from '@oppsera/module-catalog';

function extractGroupId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 1]!;
}

// GET /api/v1/catalog/modifier-groups/:id — modifier group detail with modifiers + assignment count
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const groupId = extractGroupId(request);
    const detail = await getModifierGroup(ctx.tenantId, groupId);

    if (!detail) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Modifier group ${groupId} not found` } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: detail });
  },
  { entitlement: 'catalog', permission: 'catalog.view' },
);

// PATCH /api/v1/catalog/modifier-groups/:id — update modifier group
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const groupId = extractGroupId(request);
    const body = await request.json();
    const parsed = updateModifierGroupSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const group = await updateModifierGroup(ctx, groupId, parsed.data);
    return NextResponse.json({ data: group });
  },
  { entitlement: 'catalog', permission: 'catalog.manage', writeAccess: true },
);
