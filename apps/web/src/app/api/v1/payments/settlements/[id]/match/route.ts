import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { matchSettlement, manualMatchSettlementLine } from '@oppsera/module-payments';

function extractSettlementId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  // /api/v1/payments/settlements/{id}/match
  const idx = parts.indexOf('settlements');
  return parts[idx + 1]!;
}

/**
 * POST /api/v1/payments/settlements/:id/match
 *
 * Re-run automatic matching for a settlement, or manually match a specific line.
 *
 * Body (auto-match): {}
 * Body (manual match): { lineId: string, tenderId: string }
 */
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const settlementId = extractSettlementId(request);
    const body = await request.json().catch(() => ({}));

    // Manual match if lineId + tenderId provided
    if (body.lineId && body.tenderId) {
      await manualMatchSettlementLine(ctx, {
        settlementId,
        lineId: body.lineId,
        tenderId: body.tenderId,
      });
      return NextResponse.json({ data: { success: true } });
    }

    // Auto-match
    const result = await matchSettlement(ctx, { settlementId });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'payments', permission: 'accounting.bank_reconciliation.manage', writeAccess: true },
);
