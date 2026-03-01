import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getProvider,
  updateProvider,
  deactivateProvider,
  updateProviderSchema,
} from '@oppsera/module-spa';

function extractId(url: string): string | null {
  return url.split('/providers/')[1]?.split('/')[0]?.split('?')[0] ?? null;
}

// GET /api/v1/spa/providers/[id] — get provider detail with availability, time-off, eligible services
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request.url);
    if (!id) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Missing provider ID' } },
        { status: 400 },
      );
    }

    const provider = await getProvider(ctx.tenantId, id);
    if (!provider) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Provider not found' } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: provider });
  },
  { entitlement: 'spa', permission: 'spa.providers.view' },
);

// PATCH /api/v1/spa/providers/[id] — update provider
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request.url);
    if (!id) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Missing provider ID' } },
        { status: 400 },
      );
    }

    const body = await request.json();
    const parsed = updateProviderSchema.safeParse({ ...body, id });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const provider = await updateProvider(ctx, parsed.data);
    return NextResponse.json({ data: provider });
  },
  { entitlement: 'spa', permission: 'spa.providers.manage', writeAccess: true },
);

// DELETE /api/v1/spa/providers/[id] — deactivate provider (soft delete)
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request.url);
    if (!id) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Missing provider ID' } },
        { status: 400 },
      );
    }

    const provider = await deactivateProvider(ctx, id);
    return NextResponse.json({ data: provider });
  },
  { entitlement: 'spa', permission: 'spa.providers.manage', writeAccess: true },
);
