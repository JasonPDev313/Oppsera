import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { refundCheck, refundCheckSchema } from '@oppsera/module-fnb';

// POST /api/v1/fnb/tabs/[id]/check/refund — refund a check
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = refundCheckSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const orderId = body.orderId as string;

    const result = await refundCheck(ctx, ctx.locationId ?? '', orderId, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.payments.manage' },
);
