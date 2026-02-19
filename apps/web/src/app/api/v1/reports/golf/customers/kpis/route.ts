import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getGolfCustomerKpis } from '@oppsera/module-golf-reporting';

export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const kpis = await getGolfCustomerKpis({
      tenantId: ctx.tenantId,
    });

    return NextResponse.json({ data: kpis });
  },
  { entitlement: 'reporting', permission: 'reports.view' },
);
