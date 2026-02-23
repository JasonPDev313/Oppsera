import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getTipPoolDetail,
  updateTipPool,
  getTipPoolDetailSchema,
  updateTipPoolSchema,
} from '@oppsera/module-fnb';

// GET /api/v1/fnb/tips/pools/[id] — get tip pool detail
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = request.nextUrl.pathname.split('/');
    const poolId = parts[parts.length - 1]!;

    const parsed = getTipPoolDetailSchema.safeParse({
      tenantId: ctx.tenantId,
      poolId,
    });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await getTipPoolDetail(parsed.data);
    if (!result) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Tip pool not found' } },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.tips.view' },
);

// PATCH /api/v1/fnb/tips/pools/[id] — update tip pool
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = request.nextUrl.pathname.split('/');
    const poolId = parts[parts.length - 1]!;

    const body = await request.json();
    const parsed = updateTipPoolSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    // updateTipPool takes (ctx, poolId, input)
    const result = await updateTipPool(ctx, poolId, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.tips.manage' , writeAccess: true },
);
