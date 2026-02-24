import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getTag,
  updateTag,
  archiveTag,
  updateTagSchema,
  archiveTagSchema,
} from '@oppsera/module-customers';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

// GET /api/v1/customers/tags/:id
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const tagId = extractId(request);
    const tag = await getTag({ tenantId: ctx.tenantId, tagId });
    if (!tag) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Tag not found' } },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: tag });
  },
  { entitlement: 'customers', permission: 'customers.tags.view' },
);

// PATCH /api/v1/customers/tags/:id
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const tagId = extractId(request);
    const body = await request.json();
    const parsed = updateTagSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const tag = await updateTag(ctx, tagId, parsed.data);
    return NextResponse.json({ data: tag });
  },
  { entitlement: 'customers', permission: 'customers.tags.manage', writeAccess: true },
);

// DELETE /api/v1/customers/tags/:id (archive)
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const tagId = extractId(request);
    const body = await request.json().catch(() => ({}));
    const parsed = archiveTagSchema.safeParse({ reason: body.reason });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const tag = await archiveTag(ctx, tagId, parsed.data);
    return NextResponse.json({ data: tag });
  },
  { entitlement: 'customers', permission: 'customers.tags.manage', writeAccess: true },
);
