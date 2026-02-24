import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  getTransactionDetail,
} from '@oppsera/module-payments';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

/**
 * GET /api/v1/payments/transactions/:id
 * Full detail with all transaction records.
 */
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const detail = await getTransactionDetail(ctx.tenantId, id);
    if (!detail) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Payment intent not found' } },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: detail });
  },
  { entitlement: 'payments', permission: 'payments.transactions.view' },
);
