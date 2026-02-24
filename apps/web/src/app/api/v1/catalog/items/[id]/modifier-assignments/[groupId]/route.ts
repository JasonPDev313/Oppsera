import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  updateItemModifierAssignment,
  updateItemModifierAssignmentSchema,
  removeItemModifierAssignment,
} from '@oppsera/module-catalog';

function extractIds(request: NextRequest): { itemId: string; groupId: string } {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // /api/v1/catalog/items/:id/modifier-assignments/:groupId
  return {
    itemId: parts[parts.length - 3]!,
    groupId: parts[parts.length - 1]!,
  };
}

// PATCH /api/v1/catalog/items/:id/modifier-assignments/:groupId — update assignment overrides
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { itemId, groupId } = extractIds(request);
    const body = await request.json();
    const parsed = updateItemModifierAssignmentSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const assignment = await updateItemModifierAssignment(ctx, itemId, groupId, parsed.data);
    return NextResponse.json({ data: assignment });
  },
  { entitlement: 'catalog', permission: 'catalog.manage', writeAccess: true },
);

// DELETE /api/v1/catalog/items/:id/modifier-assignments/:groupId — remove assignment
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { itemId, groupId } = extractIds(request);
    await removeItemModifierAssignment(ctx, itemId, groupId);
    return NextResponse.json({ data: { deleted: true } });
  },
  { entitlement: 'catalog', permission: 'catalog.manage', writeAccess: true },
);
