import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getEmployeeExpenseTotals } from '@oppsera/module-expenses';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') ?? ctx.user.id;
    const result = await getEmployeeExpenseTotals({
      tenantId: ctx.tenantId,
      userId,
      fromDate: searchParams.get('fromDate') ?? undefined,
      toDate: searchParams.get('toDate') ?? undefined,
    });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'expense_management', permission: 'expenses.view' },
);
