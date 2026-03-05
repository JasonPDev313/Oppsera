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

    // Merge comparativeSections into main sections as priorAmount on each account
    // so the frontend can show current vs prior side-by-side
    if (report.comparativeSections) {
      const priorByAccountId = new Map<string, number>();
      for (const section of report.comparativeSections) {
        for (const acct of section.accounts) {
          priorByAccountId.set(acct.accountId, acct.amount);
        }
      }
      for (const section of report.sections) {
        for (const acct of section.accounts) {
          acct.priorAmount = priorByAccountId.get(acct.accountId) ?? 0;
        }
      }
    }

    return NextResponse.json({ data: report });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
