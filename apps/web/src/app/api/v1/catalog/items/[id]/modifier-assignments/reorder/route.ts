import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  reorderItemModifierAssignments,
  reorderItemModifierAssignmentsSchema,
} from '@oppsera/module-catalog';

function extractItemId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // /api/v1/catalog/items/:id/modifier-assignments/reorder
  return parts[parts.length - 3]!;
}

// PATCH /api/v1/catalog/items/:id/modifier-assignments/reorder — batch reorder modifier groups
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const itemId = extractItemId(request);
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = reorderItemModifierAssignmentsSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await reorderItemModifierAssignments(ctx, itemId, parsed.data.orderedGroupIds);
    return NextResponse.json({ data: { reordered: result.reordered } });
  },
  { entitlement: 'catalog', permission: 'catalog.manage', writeAccess: true },
);
