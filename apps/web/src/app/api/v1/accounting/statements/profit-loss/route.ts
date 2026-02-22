import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getProfitAndLoss } from '@oppsera/module-accounting';

// GET /api/v1/accounting/statements/profit-loss — profit & loss statement
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    if (!from || !to) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'from and to are required' } },
        { status: 400 },
      );
    }

    const report = await getProfitAndLoss({
      tenantId: ctx.tenantId,
      from,
      to,
      locationId: url.searchParams.get('locationId') ?? undefined,
      profitCenterId: url.searchParams.get('profitCenterId') ?? undefined,
      subDepartmentId: url.searchParams.get('subDepartmentId') ?? undefined,
      channel: url.searchParams.get('channel') ?? undefined,
      comparativeFrom: url.searchParams.get('comparativeFrom') ?? undefined,
      comparativeTo: url.searchParams.get('comparativeTo') ?? undefined,
    });

    return NextResponse.json({ data: report });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
