import { withTenant, sql } from '@oppsera/db';

export interface BudgetLine {
  id: string;
  glAccountId: string;
  accountNumber: string;
  accountName: string;
  accountType: string;
  month1: number;
  month2: number;
  month3: number;
  month4: number;
  month5: number;
  month6: number;
  month7: number;
  month8: number;
  month9: number;
  month10: number;
  month11: number;
  month12: number;
  annualTotal: number;
  notes: string | null;
}

export interface BudgetDetail {
  id: string;
  name: string;
  fiscalYear: number;
  status: string;
  description: string | null;
  locationId: string | null;
  createdBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lines: BudgetLine[];
}

export async function getBudget(input: {
  tenantId: string;
  budgetId: string;
}): Promise<BudgetDetail | null> {
  return withTenant(input.tenantId, async (tx) => {
    // Fetch budget header
    const headerRows = await tx.execute(sql`
      SELECT id, name, fiscal_year, status, description, location_id,
             created_by, approved_by, approved_at, created_at, updated_at
      FROM budgets
      WHERE id = ${input.budgetId} AND tenant_id = ${input.tenantId}
      LIMIT 1
    `);

    const headers = Array.from(headerRows as Iterable<Record<string, unknown>>);
    if (headers.length === 0) return null;
    const h = headers[0]!;

    // Fetch lines with account info
    const lineRows = await tx.execute(sql`
      SELECT
        bl.id,
        bl.gl_account_id,
        ga.account_number,
        ga.name AS account_name,
        ga.account_type,
        bl.month_1, bl.month_2, bl.month_3, bl.month_4,
        bl.month_5, bl.month_6, bl.month_7, bl.month_8,
        bl.month_9, bl.month_10, bl.month_11, bl.month_12,
        bl.notes
      FROM budget_lines bl
      JOIN gl_accounts ga ON ga.id = bl.gl_account_id
      WHERE bl.budget_id = ${input.budgetId} AND bl.tenant_id = ${input.tenantId}
      ORDER BY ga.account_number ASC
    `);

    const lines = Array.from(lineRows as Iterable<Record<string, unknown>>).map((r) => {
      const months = [
        Number(r.month_1 ?? 0), Number(r.month_2 ?? 0), Number(r.month_3 ?? 0),
        Number(r.month_4 ?? 0), Number(r.month_5 ?? 0), Number(r.month_6 ?? 0),
        Number(r.month_7 ?? 0), Number(r.month_8 ?? 0), Number(r.month_9 ?? 0),
        Number(r.month_10 ?? 0), Number(r.month_11 ?? 0), Number(r.month_12 ?? 0),
      ];

      return {
        id: String(r.id),
        glAccountId: String(r.gl_account_id),
        accountNumber: String(r.account_number),
        accountName: String(r.account_name),
        accountType: String(r.account_type),
        month1: months[0]!,
        month2: months[1]!,
        month3: months[2]!,
        month4: months[3]!,
        month5: months[4]!,
        month6: months[5]!,
        month7: months[6]!,
        month8: months[7]!,
        month9: months[8]!,
        month10: months[9]!,
        month11: months[10]!,
        month12: months[11]!,
        annualTotal: months.reduce((a, b) => a + b, 0),
        notes: r.notes ? String(r.notes) : null,
      };
    });

    return {
      id: String(h.id),
      name: String(h.name),
      fiscalYear: Number(h.fiscal_year),
      status: String(h.status),
      description: h.description ? String(h.description) : null,
      locationId: h.location_id ? String(h.location_id) : null,
      createdBy: h.created_by ? String(h.created_by) : null,
      approvedBy: h.approved_by ? String(h.approved_by) : null,
      approvedAt: h.approved_at ? String(h.approved_at) : null,
      createdAt: String(h.created_at),
      updatedAt: String(h.updated_at),
      lines,
    };
  });
}
