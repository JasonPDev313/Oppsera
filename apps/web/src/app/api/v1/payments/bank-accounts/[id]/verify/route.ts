import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  verifyMicroDeposits,
  verifyMicroDepositsSchema,
} from '@oppsera/module-payments';

// POST /api/v1/payments/bank-accounts/:id/verify
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = new URL(request.url).pathname.split('/');
    // /api/v1/payments/bank-accounts/{id}/verify
    const bankAccountsIdx = parts.indexOf('bank-accounts');
    const paymentMethodId = parts[bankAccountsIdx + 1]!;

    const body = await request.json();
    const parsed = verifyMicroDepositsSchema.safeParse({
      ...body,
      paymentMethodId,
    });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await verifyMicroDeposits(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'payments', permission: 'customers.manage', writeAccess: true },
);
