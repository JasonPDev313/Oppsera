import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface TipPayoutItem {
  id: string;
  locationId: string;
  employeeId: string;
  employeeName: string | null;
  payoutType: string;
  amountCents: number;
  businessDate: string;
  drawerSessionId: string | null;
  payrollPeriod: string | null;
  status: string;
  approvedBy: string | null;
  glJournalEntryId: string | null;
  notes: string | null;
  createdAt: string;
}

export interface ListTipPayoutsResult {
  items: TipPayoutItem[];
  cursor: string | null;
  hasMore: boolean;
}

/**
 * List tip payouts with filters and cursor pagination.
 */
export async function listTipPayouts(input: {
  tenantId: string;
  locationId?: string;
  employeeId?: string;
  businessDateFrom?: string;
  businessDateTo?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}): Promise<ListTipPayoutsResult> {
  const limit = input.limit ?? 50;

  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT
        tp.id,
        tp.location_id,
        tp.employee_id,
        u.display_name AS employee_name,
        tp.payout_type,
        tp.amount_cents,
        tp.business_date::text AS business_date,
        tp.drawer_session_id,
        tp.payroll_period,
        tp.status,
        tp.approved_by,
        tp.gl_journal_entry_id,
        tp.notes,
        tp.created_at
      FROM tip_payouts tp
      LEFT JOIN users u ON u.id = tp.employee_id
      WHERE tp.tenant_id = ${input.tenantId}
        ${input.locationId ? sql`AND tp.location_id = ${input.locationId}` : sql``}
        ${input.employeeId ? sql`AND tp.employee_id = ${input.employeeId}` : sql``}
        ${input.status ? sql`AND tp.status = ${input.status}` : sql``}
        ${input.businessDateFrom ? sql`AND tp.business_date >= ${input.businessDateFrom}` : sql``}
        ${input.businessDateTo ? sql`AND tp.business_date <= ${input.businessDateTo}` : sql``}
        ${input.cursor ? sql`AND tp.id < ${input.cursor}` : sql``}
      ORDER BY tp.created_at DESC, tp.id DESC
      LIMIT ${limit + 1}
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    const hasMore = arr.length > limit;
    const items = hasMore ? arr.slice(0, limit) : arr;

    return {
      items: items.map((r) => ({
        id: String(r.id),
        locationId: String(r.location_id),
        employeeId: String(r.employee_id),
        employeeName: r.employee_name ? String(r.employee_name) : null,
        payoutType: String(r.payout_type),
        amountCents: Number(r.amount_cents),
        businessDate: String(r.business_date),
        drawerSessionId: r.drawer_session_id ? String(r.drawer_session_id) : null,
        payrollPeriod: r.payroll_period ? String(r.payroll_period) : null,
        status: String(r.status),
        approvedBy: r.approved_by ? String(r.approved_by) : null,
        glJournalEntryId: r.gl_journal_entry_id ? String(r.gl_journal_entry_id) : null,
        notes: r.notes ? String(r.notes) : null,
        createdAt: String(r.created_at),
      })),
      cursor: hasMore ? String(items[items.length - 1]!.id) : null,
      hasMore,
    };
  });
}
