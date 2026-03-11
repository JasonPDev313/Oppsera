import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { broadcastFnb } from '@oppsera/core/realtime';
import { assertImpersonationCanRefund } from '@oppsera/core/auth/impersonation-safety';
import { ValidationError } from '@oppsera/shared';
import { refundCheck, refundCheckSchema } from '@oppsera/module-fnb';

// POST /api/v1/fnb/tabs/[id]/check/refund — refund a check
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    let body: any = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = refundCheckSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    // Impersonation safety: block refunds over $500
    assertImpersonationCanRefund(ctx, parsed.data.amountCents);

    const orderId = body.orderId as string;

    const result = await refundCheck(ctx, ctx.locationId ?? '', orderId, parsed.data);
    broadcastFnb(ctx, 'tabs').catch(() => {});
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.payments.refund', writeAccess: true },
);
