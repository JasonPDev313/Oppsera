import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError, NotFoundError } from '@oppsera/shared';
import { withTenant, catalogModifierGroups, catalogModifiers } from '@oppsera/db';
import { updateModifierGroup, updateModifierGroupSchema } from '@oppsera/module-catalog';

function extractGroupId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 1]!;
}

// GET /api/v1/catalog/modifier-groups/:id — modifier group detail
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const groupId = extractGroupId(request);

    const detail = await withTenant(ctx.tenantId, async (tx) => {
      const [group] = await tx
        .select()
        .from(catalogModifierGroups)
        .where(
          and(
            eq(catalogModifierGroups.id, groupId),
            eq(catalogModifierGroups.tenantId, ctx.tenantId),
          ),
        )
        .limit(1);

      if (!group) {
        throw new NotFoundError('Modifier group', groupId);
      }

      const modifiers = await tx
        .select()
        .from(catalogModifiers)
        .where(eq(catalogModifiers.modifierGroupId, groupId));

      return { ...group, modifiers };
    });

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
  { entitlement: 'catalog', permission: 'catalog.manage' , writeAccess: true },
);
