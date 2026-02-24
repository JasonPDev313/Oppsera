import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  removePaymentMethod,
  removePaymentMethodSchema,
} from '@oppsera/module-payments';
import { ValidationError } from '@oppsera/shared';

// DELETE /api/v1/payments/bank-accounts/:id
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = new URL(request.url).pathname.split('/');
    const bankAccountsIdx = parts.indexOf('bank-accounts');
    const paymentMethodId = parts[bankAccountsIdx + 1]!;

    const parsed = removePaymentMethodSchema.safeParse({
      clientRequestId: `remove-bank-${paymentMethodId}-${Date.now()}`,
      paymentMethodId,
    });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    await removePaymentMethod(ctx, parsed.data);
    return NextResponse.json({ data: { removed: true } });
  },
  { entitlement: 'payments', permission: 'customers.manage', writeAccess: true },
);
