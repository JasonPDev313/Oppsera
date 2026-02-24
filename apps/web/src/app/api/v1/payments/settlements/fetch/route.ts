import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { fetchDailySettlements } from '@oppsera/module-payments';

/**
 * POST /api/v1/payments/settlements/fetch
 *
 * Fetch settlement data from the payment provider (e.g., CardPointe settlestat API).
 * Creates settlement records and matches transactions to tenders.
 *
 * Body: { date?: string, locationId?: string }
 *
 * Designed to be called by a daily cron job or manually by admin.
 */
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json().catch(() => ({}));
    const date = body.date as string | undefined;
    const locationId = body.locationId as string | undefined;

    const results = await fetchDailySettlements({
      tenantId: ctx.tenantId,
      locationId,
      date,
    });

    return NextResponse.json({
      data: {
        settlements: results,
        count: results.length,
      },
    });
  },
  { entitlement: 'payments', permission: 'accounting.bank_reconciliation.manage', writeAccess: true },
);
