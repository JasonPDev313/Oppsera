import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  getSettlementReportSummary,
  getSettlementReportByLocation,
  getSettlementReconciliationReport,
} from '@oppsera/module-payments';

/**
 * GET /api/v1/payments/settlements/report
 *
 * Settlement reconciliation report with summary, per-location breakdown,
 * and detailed reconciliation rows.
 *
 * Query params:
 *   startDate, endDate (required)
 *   locationId, processorName (optional)
 *   view: 'summary' | 'by-location' | 'detail' (default: 'summary')
 */
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    const locationId = url.searchParams.get('locationId') ?? undefined;
    const processorName = url.searchParams.get('processorName') ?? undefined;
    const view = url.searchParams.get('view') ?? 'summary';

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'startDate and endDate are required' } },
        { status: 400 },
      );
    }

    const filters = { startDate, endDate, locationId, processorName };

    switch (view) {
      case 'by-location': {
        const data = await getSettlementReportByLocation(ctx.tenantId, filters);
        return NextResponse.json({ data });
      }
      case 'detail': {
        const data = await getSettlementReconciliationReport(ctx.tenantId, filters);
        return NextResponse.json({ data });
      }
      case 'summary':
      default: {
        const data = await getSettlementReportSummary(ctx.tenantId, filters);
        return NextResponse.json({ data });
      }
    }
  },
  { entitlement: 'payments', permission: 'reports.view' },
);
