import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withPortalAuth } from '@/lib/with-portal-auth';

// POST /api/v1/bank-accounts/tokenize — tokenize routing + account number
export const POST = withPortalAuth(async (request: NextRequest, { session }) => {
  const body = await request.json();
  const { tokenizeBankAccount, tokenizeBankAccountSchema } = await import('@oppsera/module-payments');

  const parsed = tokenizeBankAccountSchema.safeParse(body);
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

  const result = await tokenizeBankAccount(ctx as any, parsed.data);
  return NextResponse.json({ data: result });
});
