import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  getFinancialHealthSummary,
  getMappingCoverage,
  listJournalEntries,
  listClosePeriods,
} from '@oppsera/module-accounting';

// GET /api/v1/accounting/statements/health-summary — financial health dashboard KPIs
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const asOfDate = url.searchParams.get('asOfDate') ?? new Date().toISOString().slice(0, 10);

    // Fetch all dashboard data in parallel
    const [summary, coverage, journals, periods] = await Promise.all([
      getFinancialHealthSummary({ tenantId: ctx.tenantId, asOfDate }),
      getMappingCoverage({ tenantId: ctx.tenantId }).catch(() => null),
      listJournalEntries({ tenantId: ctx.tenantId, limit: 5, status: 'posted' }).catch(() => ({ items: [] })),
      listClosePeriods({ tenantId: ctx.tenantId, limit: 1 }).catch(() => ({ items: [] })),
    ]);

    // Return period status without the full close checklist (11-16 queries).
    // The dashboard only shows period name + status; the close workflow page
    // loads the full checklist when the user navigates there.
    const latestPeriod = periods.items[0] ?? null;
    const periodInfo = latestPeriod
      ? {
          id: latestPeriod.id,
          postingPeriod: latestPeriod.postingPeriod,
          status: latestPeriod.status,
          checklist: [],
          closedAt: latestPeriod.closedAt,
          closedBy: latestPeriod.closedBy,
          notes: latestPeriod.notes,
        }
      : null;

    // Working capital = current assets (cash + undeposited) - current liabilities (AP)
    const workingCapital =
      Math.round(
        (summary.cashBalance + summary.undepositedFunds - Math.abs(summary.apBalance)) * 100,
      ) / 100;

    // Map to frontend HealthSummary shape
    const data = {
      netIncome: summary.netIncomeYTD,
      cashBalance: summary.cashBalance,
      apBalance: summary.apBalance,
      arBalance: summary.arBalance,
      workingCapital,
      mappingCoverage: coverage
        ? {
            departments: coverage.departments,
            paymentTypes: coverage.paymentTypes,
            taxGroups: coverage.taxGroups,
            overallPercentage: coverage.overallPercentage,
          }
        : { departments: { mapped: 0, total: 0 }, paymentTypes: { mapped: 0, total: 0 }, taxGroups: { mapped: 0, total: 0 }, overallPercentage: 0 },
      unmappedEventCount: summary.unmappedEventsCount,
      recentJournals: journals.items,
      currentPeriod: periodInfo,
    };

    return NextResponse.json({ data });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
