import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { listProjects } from '@oppsera/module-project-costing';

/**
 * GET /api/v1/projects/reports/summary
 * Cross-project summary report — returns all active projects with cost totals.
 */
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);
    const result = await listProjects({
      tenantId: ctx.tenantId,
      status: searchParams.get('status') ?? undefined,
      locationId: searchParams.get('locationId') ?? undefined,
      limit: 100,
    });

    // Compute cross-project totals
    let totalBudget = 0;
    let totalCost = 0;
    let projectCount = 0;

    for (const p of result.items) {
      projectCount++;
      if (p.budgetAmount) totalBudget += Number(p.budgetAmount);
      if (p.totalCost) totalCost += p.totalCost;
    }

    return NextResponse.json({
      data: {
        projects: result.items,
        summary: {
          projectCount,
          totalBudget,
          totalCost,
          totalVariance: totalBudget - totalCost,
          utilizationPercent: totalBudget > 0
            ? Number(((totalCost / totalBudget) * 100).toFixed(1))
            : null,
        },
      },
    });
  },
  { entitlement: 'accounting', permission: 'project_costing.view' },
);
