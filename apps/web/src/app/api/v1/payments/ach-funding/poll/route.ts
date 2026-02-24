import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { pollAchFunding } from '@oppsera/module-payments';

/**
 * POST /api/v1/payments/ach-funding/poll
 *
 * Trigger ACH funding status poll from the payment provider.
 * Matches transactions to our payment intents and processes returns/settlements.
 *
 * Body: { date?: string, lookbackDays?: number }
 *
 * Designed to be called by a daily cron job or manually by admin.
 */
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json().catch(() => ({}));
    const date = body.date as string | undefined;
    const lookbackDays = body.lookbackDays as number | undefined;

    const results = await pollAchFunding(ctx, {
      tenantId: ctx.tenantId,
      date,
      lookbackDays,
    });

    return NextResponse.json({
      data: {
        results,
        count: results.length,
        totalSettled: results.reduce((s, r) => s + r.settledCount, 0),
        totalReturned: results.reduce((s, r) => s + r.returnedCount, 0),
        totalOriginated: results.reduce((s, r) => s + r.originatedCount, 0),
      },
    });
  },
  { entitlement: 'payments', permission: 'accounting.bank_reconciliation.manage', writeAccess: true },
);
