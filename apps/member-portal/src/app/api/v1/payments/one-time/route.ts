import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withPortalAuth } from '@/lib/with-portal-auth';
import { buildPortalCtx } from '@/lib/build-portal-ctx';

const oneTimePaymentSchema = z
  .object({
    clientRequestId: z.string().min(1).max(128),
    amountCents: z.number().int().min(100), // minimum $1.00
    paymentMethodId: z.string().optional(),
    token: z.string().optional(),
    expiry: z.string().regex(/^\d{4}$/).optional(),
    paymentMethodType: z.enum(['card', 'ach']).default('card'),
  })
  .refine((data) => data.paymentMethodId || data.token, {
    message: 'Either paymentMethodId or token is required',
  });

export const POST = withPortalAuth(async (request: NextRequest, { session }) => {
  const body = await request.json();
  const parsed = oneTimePaymentSchema.safeParse(body);

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

  const { paymentMethodId, token, expiry, amountCents, clientRequestId } = parsed.data;
  let { paymentMethodType } = parsed.data;
  let resolvedToken = token;
  let resolvedExpiry = expiry;

  // If using a saved payment method, look up its token
  if (paymentMethodId) {
    const { listPaymentMethods } = await import('@oppsera/module-payments');
    const methods = await listPaymentMethods(session.tenantId, session.customerId);
    const method = methods.find((m) => m.id === paymentMethodId);

    if (!method) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Payment method not found' } },
        { status: 404 },
      );
    }

    // Verify ACH bank accounts are verified before allowing payment
    if (method.paymentType === 'bank_account' && method.verificationStatus !== 'verified') {
      return NextResponse.json(
        { error: { code: 'BANK_NOT_VERIFIED', message: 'Bank account must be verified before making a payment' } },
        { status: 400 },
      );
    }

    // Use the provider profile to charge (CardPointe accepts profileid/acctid as token)
    const { withTenant, customerPaymentMethods } = await import('@oppsera/db');
    const { eq, and } = await import('drizzle-orm');
    const [stored] = await withTenant(session.tenantId, async (tx) => {
      return tx
        .select({
          token: customerPaymentMethods.token,
          paymentType: customerPaymentMethods.paymentType,
          providerProfileId: customerPaymentMethods.providerProfileId,
          providerAccountId: customerPaymentMethods.providerAccountId,
        })
        .from(customerPaymentMethods)
        .where(
          and(
            eq(customerPaymentMethods.id, paymentMethodId),
            eq(customerPaymentMethods.tenantId, session.tenantId),
            eq(customerPaymentMethods.status, 'active'),
          ),
        )
        .limit(1);
    });

    if (!stored) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Payment method not found' } },
        { status: 404 },
      );
    }

    // CardPointe: use "profileid/acctid" as the account token for profile charges
    if (stored.providerProfileId && stored.providerAccountId) {
      resolvedToken = `${stored.providerProfileId}/${stored.providerAccountId}`;
    } else {
      resolvedToken = stored.token ?? undefined;
    }

    paymentMethodType = stored.paymentType === 'bank_account' ? 'ach' : 'card';
    // ACH has no expiry, cards stored via profile don't need expiry either
    resolvedExpiry = undefined;
  }

  if (!resolvedToken) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'No payment token available' } },
      { status: 400 },
    );
  }

  const ctx = await buildPortalCtx(session);
  const { salePayment } = await import('@oppsera/module-payments');

  const result = await salePayment(ctx, {
    clientRequestId,
    amountCents,
    token: resolvedToken,
    expiry: resolvedExpiry,
    paymentMethodType,
    ecomind: 'E',
    customerId: session.customerId,
    ...(paymentMethodType === 'ach'
      ? { achSecCode: 'WEB', achAccountType: 'ECHK' }
      : {}),
    metadata: { source: 'member_portal', type: 'account_payment' },
  });

  return NextResponse.json({
    data: {
      id: result.id,
      status: result.status,
      amountCents: result.amountCents,
      cardLast4: result.cardLast4,
      cardBrand: result.cardBrand,
      userMessage: result.userMessage,
      suggestedAction: result.suggestedAction,
      providerRef: result.providerRef,
    },
  });
});
