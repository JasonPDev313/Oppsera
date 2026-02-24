import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withPortalAuth } from '@/lib/with-portal-auth';

// GET /api/v1/bank-accounts — list bank accounts for authenticated customer
export const GET = withPortalAuth(async (_request: NextRequest, { session }) => {
  const { listPaymentMethods } = await import('@oppsera/module-payments');
  const methods = await listPaymentMethods(session.tenantId, session.customerId);
  const bankAccounts = methods.filter((m: any) => m.paymentType === 'bank_account');
  return NextResponse.json({ data: bankAccounts });
});

// POST /api/v1/bank-accounts — add a bank account
export const POST = withPortalAuth(async (request: NextRequest, { session }) => {
  const body = await request.json();
  const { addBankAccount, addBankAccountSchema } = await import('@oppsera/module-payments');

  const parsed = addBankAccountSchema.safeParse({
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

  const ctx = {
    tenantId: session.tenantId,
    locationId: '',
    requestId: crypto.randomUUID(),
    user: { id: `customer:${session.customerId}`, email: session.email, role: 'member' as const },
  };

  const result = await addBankAccount(ctx as any, parsed.data);
  return NextResponse.json({ data: result }, { status: 201 });
});
