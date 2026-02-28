import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { z } from 'zod';
import type { listProjectsSchema } from '../validation';

type ListProjectsInput = z.input<typeof listProjectsSchema>;

export async function listProjects(input: ListProjectsInput) {
  const { tenantId, status, locationId, customerId, startDateFrom, startDateTo, search, cursor, limit = 50 } = input;

  return withTenant(tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`p.tenant_id = ${tenantId}`,
    ];

    if (status) {
      conditions.push(sql`p.status = ${status}`);
    } else {
      // Default: exclude archived
      conditions.push(sql`p.archived_at IS NULL`);
    }

    if (locationId) {
      conditions.push(sql`p.location_id = ${locationId}`);
    }

    if (customerId) {
      conditions.push(sql`p.customer_id = ${customerId}`);
    }

    if (startDateFrom) {
      conditions.push(sql`p.start_date >= ${startDateFrom}`);
    }

    if (startDateTo) {
      conditions.push(sql`p.start_date <= ${startDateTo}`);
    }

    if (search) {
      const pattern = `%${search}%`;
      conditions.push(sql`(p.name ILIKE ${pattern} OR p.project_number ILIKE ${pattern})`);
    }

    if (cursor) {
      conditions.push(sql`p.id < ${cursor}`);
    }

    const whereClause = conditions.reduce((a, b) => sql`${a} AND ${b}`);

    const rows = await tx.execute<{
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
      created_at: string;
      updated_at: string;
      archived_at: string | null;
      version: number;
      task_count: string;
      total_cost: string | null;
    }>(sql`
      SELECT
        p.id,
        p.tenant_id,
        p.location_id,
        p.project_number,
        p.name,
        p.description,
        p.status,
        p.project_type,
        p.customer_id,
        p.manager_user_id,
        p.start_date,
        p.end_date,
        p.completion_date,
        p.budget_amount,
        p.budget_labor_hours,
        p.notes,
        p.created_at,
        p.updated_at,
        p.archived_at,
        p.version,
        (SELECT COUNT(*)::text FROM project_tasks t WHERE t.project_id = p.id) AS task_count,
        (SELECT SUM(direct_cost_amount)::text FROM rm_project_cost_summary cs WHERE cs.project_id = p.id) AS total_cost
      FROM projects p
      WHERE ${whereClause}
      ORDER BY p.id DESC
      LIMIT ${limit + 1}
    `);

    const items = Array.from(rows as Iterable<typeof rows[number]>);
    const hasMore = items.length > limit;
    const result = hasMore ? items.slice(0, limit) : items;

    return {
      items: result.map((r) => ({
        id: r.id,
        tenantId: r.tenant_id,
        locationId: r.location_id ?? null,
        projectNumber: r.project_number,
        name: r.name,
        description: r.description ?? null,
        status: r.status,
        projectType: r.project_type ?? null,
        customerId: r.customer_id ?? null,
        managerUserId: r.manager_user_id ?? null,
        startDate: r.start_date ?? null,
        endDate: r.end_date ?? null,
        completionDate: r.completion_date ?? null,
        budgetAmount: r.budget_amount ?? null,
        budgetLaborHours: r.budget_labor_hours ?? null,
        notes: r.notes ?? null,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        archivedAt: r.archived_at ?? null,
        version: Number(r.version),
        taskCount: Number(r.task_count),
        totalCost: r.total_cost ? Number(r.total_cost) : null,
      })),
      cursor: hasMore ? result[result.length - 1]!.id : null,
      hasMore,
    };
  });
}
