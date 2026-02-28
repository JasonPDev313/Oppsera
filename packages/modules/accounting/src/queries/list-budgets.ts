import { withTenant, sql } from '@oppsera/db';

export interface BudgetListItem {
  id: string;
  name: string;
  fiscalYear: number;
  status: string;
  description: string | null;
  locationId: string | null;
  createdBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  lineCount: number;
  totalBudget: number;
  createdAt: string;
  updatedAt: string;
}

export interface ListBudgetsResult {
  items: BudgetListItem[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listBudgets(input: {
  tenantId: string;
  fiscalYear?: number;
  status?: string;
  cursor?: string;
  limit?: number;
}): Promise<ListBudgetsResult> {
  const limit = input.limit ?? 50;

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [sql`b.tenant_id = ${input.tenantId}`];

    if (input.fiscalYear) {
      conditions.push(sql`b.fiscal_year = ${input.fiscalYear}`);
    }
    if (input.status) {
      conditions.push(sql`b.status = ${input.status}`);
    }
    if (input.cursor) {
      conditions.push(sql`b.id < ${input.cursor}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(sql`
      SELECT
        b.id,
        b.name,
        b.fiscal_year,
        b.status,
        b.description,
        b.location_id,
        b.created_by,
        b.approved_by,
        b.approved_at,
        b.created_at,
        b.updated_at,
        COALESCE(agg.line_count, 0) AS line_count,
        COALESCE(agg.total_budget, 0) AS total_budget
      FROM budgets b
      LEFT JOIN (
        SELECT
          budget_id,
          COUNT(*) AS line_count,
          SUM(month_1 + month_2 + month_3 + month_4 + month_5 + month_6 +
              month_7 + month_8 + month_9 + month_10 + month_11 + month_12) AS total_budget
        FROM budget_lines
        GROUP BY budget_id
      ) agg ON agg.budget_id = b.id
      WHERE ${whereClause}
      ORDER BY b.fiscal_year DESC, b.name ASC
      LIMIT ${limit + 1}
    `);

    const items = Array.from(rows as Iterable<Record<string, unknown>>);
    const hasMore = items.length > limit;
    const result = hasMore ? items.slice(0, limit) : items;

    return {
      items: result.map((r) => ({
        id: String(r.id),
        name: String(r.name),
        fiscalYear: Number(r.fiscal_year),
        status: String(r.status),
        description: r.description ? String(r.description) : null,
        locationId: r.location_id ? String(r.location_id) : null,
        createdBy: r.created_by ? String(r.created_by) : null,
        approvedBy: r.approved_by ? String(r.approved_by) : null,
        approvedAt: r.approved_at ? String(r.approved_at) : null,
        lineCount: Number(r.line_count ?? 0),
        totalBudget: Number(r.total_budget ?? 0),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      })),
      cursor: hasMore ? String(result[result.length - 1]!.id) : null,
      hasMore,
    };
  });
}
