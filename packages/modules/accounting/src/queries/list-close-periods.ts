import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface ClosePeriodItem {
  id: string;
  postingPeriod: string;
  status: string;
  closedAt: string | null;
  closedBy: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ListClosePeriodsInput {
  tenantId: string;
  status?: string;
  cursor?: string;
  limit?: number;
}

export interface ListClosePeriodsResult {
  items: ClosePeriodItem[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listClosePeriods(
  input: ListClosePeriodsInput,
): Promise<ListClosePeriodsResult> {
  const limit = input.limit ?? 25;

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [sql`tenant_id = ${input.tenantId}`];

    if (input.status) {
      conditions.push(sql`status = ${input.status}`);
    }

    if (input.cursor) {
      conditions.push(sql`posting_period < ${input.cursor}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(sql`
      SELECT id, posting_period, status, closed_at, closed_by, notes, created_at, updated_at
      FROM accounting_close_periods
      WHERE ${whereClause}
      ORDER BY posting_period DESC
      LIMIT ${limit + 1}
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    const hasMore = arr.length > limit;
    const items = hasMore ? arr.slice(0, limit) : arr;

    return {
      items: items.map((r) => ({
        id: String(r.id),
        postingPeriod: String(r.posting_period),
        status: String(r.status),
        closedAt: r.closed_at ? String(r.closed_at) : null,
        closedBy: r.closed_by ? String(r.closed_by) : null,
        notes: r.notes ? String(r.notes) : null,
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      })),
      cursor: hasMore ? String(items[items.length - 1]!.posting_period) : null,
      hasMore,
    };
  });
}
