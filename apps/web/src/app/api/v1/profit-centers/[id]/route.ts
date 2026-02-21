import { NextResponse, type NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getProfitCenter,
  updateProfitCenter,
  deactivateProfitCenter,
  updateProfitCenterSchema,
} from '@oppsera/core/profit-centers';

function extractId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 1]!;
}

// GET /api/v1/profit-centers/:id
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const result = await getProfitCenter({ tenantId: ctx.tenantId, id });

    if (!result) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Profit center '${id}' not found` } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: result });
  },
  { entitlement: 'platform_core', permission: 'settings.view' },
);

// PATCH /api/v1/profit-centers/:id
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const body = await request.json();
    const parsed = updateProfitCenterSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await updateProfitCenter(ctx, id, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'platform_core', permission: 'settings.update' },
);

// DELETE /api/v1/profit-centers/:id (soft-delete)
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    await deactivateProfitCenter(ctx, id);
    return NextResponse.json({ data: { id } });
  },
  { entitlement: 'platform_core', permission: 'settings.update' },
);
