import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface GetRecentActivityInput {
  tenantId: string;
  locationId?: string;
  limit?: number; // default 10
  cursor?: string; // ULID-based cursor (id of last item)
  source?: string; // filter by source type (pos_order, pms_folio, ar_invoice, membership, voucher)
}

export interface RevenueActivityItem {
  id: string;
  source: string;
  sourceId: string;
  sourceLabel: string;
  customerName: string | null;
  amountDollars: number;
  status: string;
  occurredAt: string;
  businessDate: string;
  metadata: Record<string, unknown> | null;
}

export interface GetRecentActivityResult {
  items: RevenueActivityItem[];
  cursor: string | null;
  hasMore: boolean;
}

/**
 * Queries rm_revenue_activity with cursor pagination.
 * Returns recent revenue-generating events across all sources.
 */
export async function getRecentActivity(
  input: GetRecentActivityInput,
): Promise<GetRecentActivityResult> {
  const limit = Math.min(input.limit ?? 10, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`tenant_id = ${input.tenantId}`,
    ];

    if (input.locationId) {
      conditions.push(sql`location_id = ${input.locationId}`);
    }

    if (input.source) {
      conditions.push(sql`source = ${input.source}`);
    }

    if (input.cursor) {
      conditions.push(sql`id < ${input.cursor}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await (tx as any).execute(sql`
      SELECT
        id, source, source_id, source_label, customer_name,
        amount_dollars, status, occurred_at, business_date, metadata
      FROM rm_revenue_activity
      WHERE ${whereClause}
      ORDER BY id DESC
      LIMIT ${limit + 1}
    `);

    const allRows = Array.from(rows as Iterable<Record<string, unknown>>);
    const hasMore = allRows.length > limit;
    const items = hasMore ? allRows.slice(0, limit) : allRows;

    return {
      items: items.map((row) => ({
        id: String(row.id),
        source: String(row.source),
        sourceId: String(row.source_id),
        sourceLabel: String(row.source_label),
        customerName: row.customer_name ? String(row.customer_name) : null,
        amountDollars: Number(row.amount_dollars) || 0,
        status: String(row.status),
        occurredAt: row.occurred_at instanceof Date
          ? row.occurred_at.toISOString()
          : String(row.occurred_at ?? ''),
        businessDate: String(row.business_date ?? ''),
        metadata: row.metadata as Record<string, unknown> | null,
      })),
      cursor: hasMore && items.length > 0 ? String(items[items.length - 1]!.id) : null,
      hasMore,
    };
  });
}
