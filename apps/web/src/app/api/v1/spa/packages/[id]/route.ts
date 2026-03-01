import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getPackageDefinition,
  updatePackageDefinition,
  updatePackageDefinitionSchema,
  deactivatePackageDefinition,
} from '@oppsera/module-spa';

function extractId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // /api/v1/spa/packages/:id
  return parts[parts.length - 1]!;
}

// GET /api/v1/spa/packages/:id — package definition detail
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const result = await getPackageDefinition(ctx.tenantId, id);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'spa', permission: 'spa.packages.view' },
);

// PATCH /api/v1/spa/packages/:id — partial update
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const body = await request.json();
    const parsed = updatePackageDefinitionSchema.safeParse({ ...body, id });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await updatePackageDefinition(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'spa', permission: 'spa.packages.manage', writeAccess: true },
);

// DELETE /api/v1/spa/packages/:id — deactivate package definition
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const result = await deactivatePackageDefinition(ctx, { id });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'spa', permission: 'spa.packages.manage', writeAccess: true },
);
