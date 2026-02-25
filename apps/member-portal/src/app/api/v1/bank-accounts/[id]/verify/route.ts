import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withPortalAuth } from '@/lib/with-portal-auth';

// POST /api/v1/bank-accounts/:id/verify — verify micro-deposit amounts
export const POST = withPortalAuth(async (request: NextRequest, { session }) => {
  const parts = new URL(request.url).pathname.split('/');
  const bankAccountsIdx = parts.indexOf('bank-accounts');
  const paymentMethodId = parts[bankAccountsIdx + 1];

  if (!paymentMethodId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Missing payment method ID' } },
      { status: 400 },
    );
  }

  const body = await request.json();
  const { verifyMicroDeposits, verifyMicroDepositsSchema } = await import('@oppsera/module-payments');

  const parsed = verifyMicroDepositsSchema.safeParse({
    ...body,
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
  const result = await verifyMicroDeposits(ctx, parsed.data);
  return NextResponse.json({ data: result });
});
