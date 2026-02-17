import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { recordArPayment, recordArPaymentSchema } from '@oppsera/module-customers';

function extractAccountId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 2]!;
}

// POST /api/v1/billing/accounts/:id/payments — record AR payment
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractAccountId(request);
    const body = await request.json();
    const parsed = recordArPaymentSchema.safeParse({ ...body, billingAccountId: id });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const payment = await recordArPayment(ctx, parsed.data);

    return NextResponse.json({ data: payment }, { status: 201 });
  },
  { entitlement: 'customers', permission: 'billing.manage' },
);
