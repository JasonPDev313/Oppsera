import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { assertImpersonationCanRefund } from '@oppsera/core/auth/impersonation-safety';
import {
  refundPaymentSchema,
  refundPayment,
  PMS_PERMISSIONS,
} from '@oppsera/module-pms';
import { ValidationError } from '@oppsera/shared';

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    // /api/v1/pms/payments/[id]/refund → id is at index -2
    const id = parts[parts.length - 2]!;
    const body = await request.json();
    const parsed = refundPaymentSchema.safeParse({ ...body, transactionId: id });
    if (!parsed.success) {
      throw new ValidationError('Invalid input', parsed.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      })));
    }

    // Impersonation safety: block refunds over $500
    if (parsed.data.amountCents !== undefined) {
      assertImpersonationCanRefund(ctx, parsed.data.amountCents);
    }

    const result = await refundPayment(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.PAYMENTS_REFUND, writeAccess: true },
);
