import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { AppError } from '@oppsera/shared';

export async function getProjectProfitability(tenantId: string, projectId: string) {
  return withTenant(tenantId, async (tx) => {
    // Verify project exists
    const [project] = await tx.execute<{
      id: string;
      name: string;
      project_number: string;
      status: string;
      budget_amount: string | null;
      budget_labor_hours: string | null;
    }>(sql`
      SELECT id, name, project_number, status, budget_amount, budget_labor_hours
      FROM projects
      WHERE tenant_id = ${tenantId} AND id = ${projectId}
    `);

    if (!project) {
      throw new AppError('NOT_FOUND', 'Project not found', 404);
    }

    // Per-period cost summary
    const periodRows = await tx.execute<{
      fiscal_period: string;
      revenue_amount: string;
      direct_cost_amount: string;
      labor_hours: string;
      labor_cost: string;
      material_cost: string;
      other_cost: string;
      gross_margin: string;
    }>(sql`
      SELECT fiscal_period, revenue_amount, direct_cost_amount,
        labor_hours, labor_cost, material_cost, other_cost, gross_margin
      FROM rm_project_cost_summary
      WHERE tenant_id = ${tenantId} AND project_id = ${projectId}
      ORDER BY fiscal_period ASC
    `);

    const periods = Array.from(periodRows as Iterable<typeof periodRows[number]>).map((r) => ({
      fiscalPeriod: r.fiscal_period,
      revenueAmount: Number(r.revenue_amount),
      directCostAmount: Number(r.direct_cost_amount),
      laborHours: Number(r.labor_hours),
      laborCost: Number(r.labor_cost),
      materialCost: Number(r.material_cost),
      otherCost: Number(r.other_cost),
      grossMargin: Number(r.gross_margin),
    }));

    // Aggregate totals
    const totals = periods.reduce(
      (acc, p) => ({
        totalRevenue: acc.totalRevenue + p.revenueAmount,
        totalDirectCost: acc.totalDirectCost + p.directCostAmount,
        totalLaborHours: acc.totalLaborHours + p.laborHours,
        totalLaborCost: acc.totalLaborCost + p.laborCost,
        totalMaterialCost: acc.totalMaterialCost + p.materialCost,
        totalOtherCost: acc.totalOtherCost + p.otherCost,
        totalGrossMargin: acc.totalGrossMargin + p.grossMargin,
      }),
      {
        totalRevenue: 0,
        totalDirectCost: 0,
        totalLaborHours: 0,
        totalLaborCost: 0,
        totalMaterialCost: 0,
        totalOtherCost: 0,
        totalGrossMargin: 0,
      },
    );

    const budgetAmount = project.budget_amount ? Number(project.budget_amount) : null;
    const budgetLaborHours = project.budget_labor_hours ? Number(project.budget_labor_hours) : null;

    return {
      projectId: project.id,
      projectNumber: project.project_number,
      projectName: project.name,
      status: project.status,
      budgetAmount,
      budgetLaborHours,
      budgetVariance: budgetAmount != null ? budgetAmount - totals.totalDirectCost : null,
      budgetUsedPercent: budgetAmount != null && budgetAmount > 0
        ? Number(((totals.totalDirectCost / budgetAmount) * 100).toFixed(1))
        : null,
      laborHoursVariance: budgetLaborHours != null ? budgetLaborHours - totals.totalLaborHours : null,
      laborHoursUsedPercent: budgetLaborHours != null && budgetLaborHours > 0
        ? Number(((totals.totalLaborHours / budgetLaborHours) * 100).toFixed(1))
        : null,
      marginPercent: totals.totalRevenue > 0
        ? Number(((totals.totalGrossMargin / totals.totalRevenue) * 100).toFixed(1))
        : null,
      totals,
      periods,
    };
  });
}
