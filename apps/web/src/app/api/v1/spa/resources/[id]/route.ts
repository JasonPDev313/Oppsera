import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import {
  getResource,
  updateResource,
  deactivateResource,
  updateResourceSchema,
} from '@oppsera/module-spa';

function extractId(url: string): string | null {
  return url.split('/resources/')[1]?.split('/')[0]?.split('?')[0] ?? null;
}

// GET /api/v1/spa/resources/[id] — get a single spa resource
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request.url);
    if (!id) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Missing resource ID' } },
        { status: 400 },
      );
    }

    const resource = await getResource(ctx.tenantId, id);

    if (!resource) {
      throw new NotFoundError('Resource', id);
    }

    return NextResponse.json({ data: resource });
  },
  { entitlement: 'spa', permission: 'spa.resources.view' },
);

// PATCH /api/v1/spa/resources/[id] — update a spa resource
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request.url);
    if (!id) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Missing resource ID' } },
        { status: 400 },
      );
    }
    const body = await request.json();

    const parsed = updateResourceSchema.safeParse({ ...body, id });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const resource = await updateResource(ctx, parsed.data);
    return NextResponse.json({ data: resource });
  },
  { entitlement: 'spa', permission: 'spa.resources.manage', writeAccess: true },
);

// DELETE /api/v1/spa/resources/[id] — deactivate a spa resource (soft-delete)
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request.url);
    if (!id) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Missing resource ID' } },
        { status: 400 },
      );
    }

    const resource = await deactivateResource(ctx, id);
    return NextResponse.json({ data: resource });
  },
  { entitlement: 'spa', permission: 'spa.resources.manage', writeAccess: true },
);
