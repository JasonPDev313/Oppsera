import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getSettlementVariance } from '@oppsera/module-payments';

function extractSettlementId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  const idx = parts.indexOf('settlements');
  return parts[idx + 1]!;
}

/**
 * GET /api/v1/payments/settlements/:id/variance
 *
 * Get variance report for a specific settlement.
 * Shows difference between our captured amounts and provider settled amounts.
 */
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const settlementId = extractSettlementId(request);
    const result = await getSettlementVariance(ctx.tenantId, settlementId);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'payments', permission: 'accounting.bank_reconciliation.manage' },
);
