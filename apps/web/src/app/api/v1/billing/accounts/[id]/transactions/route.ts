import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getArLedger,
  recordArTransaction,
  recordArTransactionSchema,
} from '@oppsera/module-customers';

function extractAccountId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 2]!;
}

// GET /api/v1/billing/accounts/:id/transactions — AR ledger with cursor pagination
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractAccountId(request);
    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 50;

    const result = await getArLedger({
      tenantId: ctx.tenantId,
      billingAccountId: id,
      cursor,
      limit,
    });

    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'customers', permission: 'billing.view' },
);

// POST /api/v1/billing/accounts/:id/transactions — record AR transaction (charge, adjustment, writeoff)
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractAccountId(request);
    const body = await request.json();
    const parsed = recordArTransactionSchema.safeParse({ ...body, billingAccountId: id });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const transaction = await recordArTransaction(ctx, parsed.data);

    return NextResponse.json({ data: transaction }, { status: 201 });
  },
  { entitlement: 'customers', permission: 'billing.manage' },
);
