import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { AppError } from '@oppsera/shared';

export async function getProject(tenantId: string, projectId: string) {
  return withTenant(tenantId, async (tx) => {
    // Project header
    const [project] = await tx.execute<{
      id: string;
      tenant_id: string;
      location_id: string | null;
      project_number: string;
      name: string;
      description: string | null;
      status: string;
      project_type: string | null;
      customer_id: string | null;
      manager_user_id: string | null;
      start_date: string | null;
      end_date: string | null;
      completion_date: string | null;
      budget_amount: string | null;
      budget_labor_hours: string | null;
      notes: string | null;
      metadata: Record<string, unknown>;
      created_at: string;
      updated_at: string;
      created_by: string | null;
      archived_at: string | null;
      archived_by: string | null;
      archived_reason: string | null;
      version: number;
    }>(sql`
      SELECT
        id, tenant_id, location_id, project_number, name, description,
        status, project_type, customer_id, manager_user_id,
        start_date, end_date, completion_date,
        budget_amount, budget_labor_hours, notes, metadata,
        created_at, updated_at, created_by,
        archived_at, archived_by, archived_reason, version
      FROM projects
      WHERE tenant_id = ${tenantId} AND id = ${projectId}
    `);

    if (!project) {
      throw new AppError('NOT_FOUND', 'Project not found', 404);
    }

    // Tasks
    const taskRows = await tx.execute<{
      id: string;
      task_number: string;
      name: string;
      description: string | null;
      status: string;
      budget_amount: string | null;
      budget_hours: string | null;
      gl_expense_account_id: string | null;
      sort_order: number;
      created_at: string;
      updated_at: string;
    }>(sql`
      SELECT id, task_number, name, description, status,
        budget_amount, budget_hours, gl_expense_account_id,
        sort_order, created_at, updated_at
      FROM project_tasks
      WHERE project_id = ${projectId}
      ORDER BY sort_order ASC, task_number ASC
    `);

    // Cost summary
    const costRows = await tx.execute<{
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
      WHERE project_id = ${projectId}
      ORDER BY fiscal_period DESC
    `);

    const tasks = Array.from(taskRows as Iterable<typeof taskRows[number]>).map((t) => ({
      id: t.id,
      taskNumber: t.task_number,
      name: t.name,
      description: t.description ?? null,
      status: t.status,
      budgetAmount: t.budget_amount ?? null,
      budgetHours: t.budget_hours ?? null,
      glExpenseAccountId: t.gl_expense_account_id ?? null,
      sortOrder: Number(t.sort_order),
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    }));

    const costSummary = Array.from(costRows as Iterable<typeof costRows[number]>).map((c) => ({
      fiscalPeriod: c.fiscal_period,
      revenueAmount: Number(c.revenue_amount),
      directCostAmount: Number(c.direct_cost_amount),
      laborHours: Number(c.labor_hours),
      laborCost: Number(c.labor_cost),
      materialCost: Number(c.material_cost),
      otherCost: Number(c.other_cost),
      grossMargin: Number(c.gross_margin),
    }));

    // Aggregate totals across all periods
    const totals = costSummary.reduce(
      (acc, c) => ({
        totalRevenue: acc.totalRevenue + c.revenueAmount,
        totalDirectCost: acc.totalDirectCost + c.directCostAmount,
        totalLaborHours: acc.totalLaborHours + c.laborHours,
        totalLaborCost: acc.totalLaborCost + c.laborCost,
        totalMaterialCost: acc.totalMaterialCost + c.materialCost,
        totalOtherCost: acc.totalOtherCost + c.otherCost,
        totalGrossMargin: acc.totalGrossMargin + c.grossMargin,
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

    return {
      id: project.id,
      tenantId: project.tenant_id,
      locationId: project.location_id ?? null,
      projectNumber: project.project_number,
      name: project.name,
      description: project.description ?? null,
      status: project.status,
      projectType: project.project_type ?? null,
      customerId: project.customer_id ?? null,
      managerUserId: project.manager_user_id ?? null,
      startDate: project.start_date ?? null,
      endDate: project.end_date ?? null,
      completionDate: project.completion_date ?? null,
      budgetAmount: project.budget_amount ?? null,
      budgetLaborHours: project.budget_labor_hours ?? null,
      notes: project.notes ?? null,
      metadata: project.metadata,
      createdAt: project.created_at,
      updatedAt: project.updated_at,
      createdBy: project.created_by ?? null,
      archivedAt: project.archived_at ?? null,
      archivedBy: project.archived_by ?? null,
      archivedReason: project.archived_reason ?? null,
      version: Number(project.version),
      tasks,
      costSummary,
      totals,
    };
  });
}
