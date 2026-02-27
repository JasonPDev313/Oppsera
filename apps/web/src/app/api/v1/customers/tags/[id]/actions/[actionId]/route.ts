import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  updateTagAction,
  deleteTagAction,
  updateTagActionSchema,
} from '@oppsera/module-customers';

function extractIds(request: NextRequest): { tagId: string; actionId: string } {
  const parts = new URL(request.url).pathname.split('/');
  // .../tags/:tagId/actions/:actionId
  const actionId = parts[parts.length - 1]!;
  const actionsIdx = parts.lastIndexOf('actions');
  const tagId = parts[actionsIdx - 1]!;
  return { tagId, actionId };
}

// PATCH /api/v1/customers/tags/:tagId/actions/:actionId
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { tagId, actionId } = extractIds(request);
    const body = await request.json();
    const parsed = updateTagActionSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const action = await updateTagAction(ctx.tenantId, tagId, actionId, parsed.data);
    return NextResponse.json({ data: action });
  },
  { entitlement: 'customers', permission: 'customers.tags.manage', writeAccess: true },
);

// DELETE /api/v1/customers/tags/:tagId/actions/:actionId
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { tagId, actionId } = extractIds(request);
    await deleteTagAction(ctx.tenantId, tagId, actionId);
    return NextResponse.json({ data: { deleted: true } });
  },
  { entitlement: 'customers', permission: 'customers.tags.manage', writeAccess: true },
);
