import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getReconciliationAr } from '@oppsera/module-ar';

// GET /api/v1/accounting/reconciliation/ar — AR reconciliation (uses real AR subledger data)
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);

    const result = await getReconciliationAr({
      tenantId: ctx.tenantId,
      asOfDate: url.searchParams.get('asOfDate') ?? undefined,
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
