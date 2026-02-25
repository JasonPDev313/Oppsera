import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withPortalAuth } from '@/lib/with-portal-auth';
import { buildPortalCtx } from '@/lib/build-portal-ctx';

// GET /api/v1/payment-methods — list all payment methods (cards + bank accounts)
export const GET = withPortalAuth(async (_request: NextRequest, { session }) => {
  const { listPaymentMethods } = await import('@oppsera/module-payments');
  const methods = await listPaymentMethods(session.tenantId, session.customerId);
  return NextResponse.json({ data: methods });
});

// POST /api/v1/payment-methods — add a saved card
export const POST = withPortalAuth(async (request: NextRequest, { session }) => {
  const body = await request.json();
  const { addPaymentMethod, addPaymentMethodSchema } = await import('@oppsera/module-payments');

  const parsed = addPaymentMethodSchema.safeParse({
    ...body,
    customerId: session.customerId,
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

  const ctx = await buildPortalCtx(session);
  const result = await addPaymentMethod(ctx, parsed.data);
  return NextResponse.json({ data: result }, { status: 201 });
});
