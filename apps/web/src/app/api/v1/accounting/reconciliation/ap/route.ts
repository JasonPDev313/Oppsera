import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { reconcileSubledger } from '@oppsera/module-accounting';

// GET /api/v1/accounting/reconciliation/ap — AP reconciliation
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);

    const result = await reconcileSubledger({
      tenantId: ctx.tenantId,
      subledgerType: 'ap',
      asOfDate: url.searchParams.get('asOfDate') ?? undefined,
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
