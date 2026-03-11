import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { distributeTipPool, distributeTipPoolSchema } from '@oppsera/module-fnb';

// POST /api/v1/fnb/tips/pools/[id]/distribute — distribute tip pool
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    let body: any = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = distributeTipPoolSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    // distributeTipPool takes (ctx, locationId, totalPoolAmountCents, input)
    const totalPoolAmountCents = body.totalPoolAmountCents as number;
    const result = await distributeTipPool(
      ctx,
      ctx.locationId ?? '',
      totalPoolAmountCents,
      parsed.data,
    );
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.tips.manage' , writeAccess: true },
);
