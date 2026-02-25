import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withPortalAuth } from '@/lib/with-portal-auth';

// DELETE /api/v1/bank-accounts/:id — remove a bank account
export const DELETE = withPortalAuth(async (request: NextRequest, { session }) => {
  const parts = new URL(request.url).pathname.split('/');
  const bankAccountsIdx = parts.indexOf('bank-accounts');
  const paymentMethodId = parts[bankAccountsIdx + 1];

  if (!paymentMethodId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Missing payment method ID' } },
      { status: 400 },
    );
  }

  const { removePaymentMethod, removePaymentMethodSchema } = await import('@oppsera/module-payments');

  const parsed = removePaymentMethodSchema.safeParse({
    clientRequestId: `portal-remove-bank-${paymentMethodId}-${Date.now()}`,
    paymentMethodId,
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
        },
      },
      { status: 400 },
    );
  }

  const { buildPortalCtx } = await import('@/lib/build-portal-ctx');
  const ctx = await buildPortalCtx(session);
  await removePaymentMethod(ctx, parsed.data);
  return NextResponse.json({ data: { removed: true } });
});
