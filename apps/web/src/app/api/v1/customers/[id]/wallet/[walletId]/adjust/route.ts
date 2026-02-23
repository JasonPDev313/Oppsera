import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { adjustWalletBalance, adjustWalletBalanceSchema } from '@oppsera/module-customers';

function extractWalletId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 2]!;
}

// POST /api/v1/customers/:id/wallet/:walletId/adjust — adjust wallet balance
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const walletAccountId = extractWalletId(request);
    const body = await request.json();
    const parsed = adjustWalletBalanceSchema.safeParse({ ...body, walletAccountId });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await adjustWalletBalance(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'customers', permission: 'billing.manage' , writeAccess: true },
);
