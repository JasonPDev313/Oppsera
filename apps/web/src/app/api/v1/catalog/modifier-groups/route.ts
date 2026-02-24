import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  createModifierGroup,
  createModifierGroupSchema,
  listModifierGroups,
} from '@oppsera/module-catalog';

// GET /api/v1/catalog/modifier-groups — list modifier groups with modifiers
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const categoryId = url.searchParams.get('categoryId') ?? undefined;
    const channel = url.searchParams.get('channel') ?? undefined;

    const groups = await listModifierGroups(ctx.tenantId, { categoryId, channel });
    return NextResponse.json({ data: groups });
  },
  { entitlement: 'catalog', permission: 'catalog.view', cache: 'private, max-age=300, stale-while-revalidate=600' },
);

// POST /api/v1/catalog/modifier-groups — create modifier group
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createModifierGroupSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const group = await createModifierGroup(ctx, parsed.data);
    return NextResponse.json({ data: group }, { status: 201 });
  },
  { entitlement: 'catalog', permission: 'catalog.manage', writeAccess: true },
);
