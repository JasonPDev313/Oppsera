import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { searchTransactions, searchTransactionsSchema } from '@oppsera/module-payments';

/**
 * GET /api/v1/payments/transactions
 * Search payment intents with filters.
 */
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const rawFilters: Record<string, unknown> = {};

    // Map query params to schema fields
    for (const key of [
      'status', 'dateFrom', 'dateTo', 'cardLast4',
      'customerId', 'orderId', 'locationId', 'cursor',
    ]) {
      const val = url.searchParams.get(key);
      if (val) rawFilters[key] = val;
    }
    for (const key of ['amountMinCents', 'amountMaxCents', 'limit']) {
      const val = url.searchParams.get(key);
      if (val) rawFilters[key] = Number(val);
    }

    const parsed = searchTransactionsSchema.safeParse(rawFilters);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid filters', details: parsed.error.issues } },
        { status: 400 },
      );
    }

    const result = await searchTransactions(ctx.tenantId, parsed.data);
    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'payments', permission: 'payments.transactions.view' },
);
