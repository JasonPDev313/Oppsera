import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  reorderTagActions,
  reorderTagActionsSchema,
} from '@oppsera/module-customers';

function extractTagId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  // .../tags/:tagId/actions/reorder → tagId is at index -3
  const actionsIdx = parts.lastIndexOf('actions');
  return parts[actionsIdx - 1]!;
}

// POST /api/v1/customers/tags/:tagId/actions/reorder
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const tagId = extractTagId(request);
    const body = await request.json();
    const parsed = reorderTagActionsSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const actions = await reorderTagActions(ctx.tenantId, tagId, parsed.data);
    return NextResponse.json({ data: actions });
  },
  { entitlement: 'customers', permission: 'customers.tags.manage', writeAccess: true },
);
