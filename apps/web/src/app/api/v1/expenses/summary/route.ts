import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getExpenseSummary } from '@oppsera/module-expenses';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);
    const result = await getExpenseSummary({
      tenantId: ctx.tenantId,
      locationId: searchParams.get('locationId') ?? undefined,
      fromPeriod: searchParams.get('fromPeriod') ?? undefined,
      toPeriod: searchParams.get('toPeriod') ?? undefined,
    });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'expenses.view' },
);
