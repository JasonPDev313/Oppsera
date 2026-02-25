import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withPortalAuth } from '@/lib/with-portal-auth';
import { buildPortalCtx } from '@/lib/build-portal-ctx';

// DELETE /api/v1/payment-methods/:id — remove a card or bank account
export const DELETE = withPortalAuth(async (request: NextRequest, { session }) => {
  const parts = new URL(request.url).pathname.split('/');
  const methodsIdx = parts.indexOf('payment-methods');
  const paymentMethodId = parts[methodsIdx + 1];

  if (!paymentMethodId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Missing payment method ID' } },
      { status: 400 },
    );
  }

  const { removePaymentMethod, removePaymentMethodSchema } = await import('@oppsera/module-payments');

  const parsed = removePaymentMethodSchema.safeParse({ paymentMethodId });
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

  const ctx = await buildPortalCtx(session);
  await removePaymentMethod(ctx, parsed.data);
  return NextResponse.json({ data: { removed: true } });
});

// PATCH /api/v1/payment-methods/:id — set as default
export const PATCH = withPortalAuth(async (request: NextRequest, { session }) => {
  const parts = new URL(request.url).pathname.split('/');
  const methodsIdx = parts.indexOf('payment-methods');
  const paymentMethodId = parts[methodsIdx + 1];

  if (!paymentMethodId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Missing payment method ID' } },
      { status: 400 },
    );
  }

  const { setDefaultPaymentMethod } = await import('@oppsera/module-payments');
  const ctx = await buildPortalCtx(session);
  await setDefaultPaymentMethod(ctx, { paymentMethodId, customerId: session.customerId });
  return NextResponse.json({ data: { updated: true } });
});
