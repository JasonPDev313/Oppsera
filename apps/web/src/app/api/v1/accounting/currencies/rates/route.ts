import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { assertImpersonationCanModifyAccounting } from '@oppsera/core/auth/impersonation-safety';
import { ValidationError } from '@oppsera/shared';
import {
  listExchangeRates,
  updateExchangeRate,
  updateExchangeRateSchema,
} from '@oppsera/module-accounting';

// GET /api/v1/accounting/currencies/rates — list exchange rates
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const fromCurrency = url.searchParams.get('fromCurrency') ?? undefined;
    const toCurrency = url.searchParams.get('toCurrency') ?? undefined;
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 50;

    const result = await listExchangeRates({
      tenantId: ctx.tenantId,
      fromCurrency,
      toCurrency,
      cursor,
      limit,
    });

    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);

// POST /api/v1/accounting/currencies/rates — create/update exchange rate
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    assertImpersonationCanModifyAccounting(ctx);

    const body = await request.json();
    const parsed = updateExchangeRateSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await updateExchangeRate(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true },
);
