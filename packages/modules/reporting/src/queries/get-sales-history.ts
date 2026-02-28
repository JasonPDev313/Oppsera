import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface GetSalesHistoryInput {
  tenantId: string;
  locationId?: string;
  sources?: string[];       // multi-select: ['pos_retail', 'pos_fnb', 'pms_folio']
  dateFrom?: string;        // ISO date YYYY-MM-DD
  dateTo?: string;
  search?: string;          // searches sourceLabel, customerName, referenceNumber
  status?: string;          // 'completed' | 'voided' | 'refunded'
  paymentMethod?: string;   // 'cash' | 'card' | 'house_account' | etc.
  sortBy?: string;          // 'occurred_at' | 'amount' | 'source'
  sortDir?: 'asc' | 'desc';
  cursor?: string;
  limit?: number;
}

export interface SalesHistoryItem {
  id: string;
  source: string;
  sourceSubType: string | null;
  effectiveSource: string;
  sourceId: string;
  sourceLabel: string;
  referenceNumber: string | null;
  customerName: string | null;
  customerId: string | null;
  employeeId: string | null;
  employeeName: string | null;
  amountDollars: number;
  subtotalDollars: number;
  taxDollars: number;
  discountDollars: number;
  tipDollars: number;
  serviceChargeDollars: number;
  paymentMethod: string | null;
  status: string;
  occurredAt: string;
  businessDate: string;
  metadata: Record<string, unknown> | null;
}

export interface SalesHistorySummary {
  totalAmount: number;
  totalCount: number;
  bySource: Array<{
    source: string;
    totalAmount: number;
    count: number;
  }>;
}

export interface GetSalesHistoryResult {
  items: SalesHistoryItem[];
  summary: SalesHistorySummary;
  cursor: string | null;
  hasMore: boolean;
}

/**
 * Queries rm_revenue_activity for unified Sales History with multi-source filtering.
 *
 * Uses COALESCE(source_sub_type, source) as the "effective source" for backward
 * compatibility with pre-migration rows that only have `source`.
 *
 * Items + summary run as parallel queries inside the same withTenant transaction.
 */
export async function getSalesHistory(
  input: GetSalesHistoryInput,
): Promise<GetSalesHistoryResult> {
  const limit = Math.min(input.limit ?? 25, 100);

  return withTenant(input.tenantId, async (tx) => {
    // Build shared WHERE conditions
    const conditions: ReturnType<typeof sql>[] = [
      sql`tenant_id = ${input.tenantId}`,
    ];

    if (input.locationId) {
      conditions.push(sql`location_id = ${input.locationId}`);
    }

    if (input.sources && input.sources.length > 0) {
      // Multi-source filter using effective source (COALESCE)
      const sourcePlaceholders = input.sources.map((s) => sql`${s}`);
      conditions.push(
        sql`COALESCE(source_sub_type, source) IN (${sql.join(sourcePlaceholders, sql`, `)})`,
      );
    }

    if (input.dateFrom) {
      conditions.push(sql`business_date >= ${input.dateFrom}`);
    }

    if (input.dateTo) {
      conditions.push(sql`business_date <= ${input.dateTo}`);
    }

    if (input.search) {
      const searchPattern = `%${input.search}%`;
      conditions.push(
        sql`(source_label ILIKE ${searchPattern} OR customer_name ILIKE ${searchPattern} OR reference_number ILIKE ${searchPattern})`,
      );
    }

    if (input.status) {
      conditions.push(sql`status = ${input.status}`);
    }

    if (input.paymentMethod) {
      conditions.push(sql`payment_method = ${input.paymentMethod}`);
    }

    if (input.cursor) {
      conditions.push(sql`id < ${input.cursor}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    // Build ORDER BY
    let orderBy = sql`id DESC`; // default: most recent first
    if (input.sortBy === 'amount') {
      orderBy = input.sortDir === 'asc'
        ? sql`amount_dollars ASC, id DESC`
        : sql`amount_dollars DESC, id DESC`;
    } else if (input.sortBy === 'source') {
      orderBy = input.sortDir === 'asc'
        ? sql`COALESCE(source_sub_type, source) ASC, id DESC`
        : sql`COALESCE(source_sub_type, source) DESC, id DESC`;
    } else if (input.sortBy === 'occurred_at') {
      orderBy = input.sortDir === 'asc'
        ? sql`occurred_at ASC, id DESC`
        : sql`occurred_at DESC, id DESC`;
    }

    // Rebuild summary WHERE without cursor
    const summaryConds: ReturnType<typeof sql>[] = [
      sql`tenant_id = ${input.tenantId}`,
    ];
    if (input.locationId) summaryConds.push(sql`location_id = ${input.locationId}`);
    if (input.sources && input.sources.length > 0) {
      const sourcePlaceholders = input.sources.map((s) => sql`${s}`);
      summaryConds.push(
        sql`COALESCE(source_sub_type, source) IN (${sql.join(sourcePlaceholders, sql`, `)})`,
      );
    }
    if (input.dateFrom) summaryConds.push(sql`business_date >= ${input.dateFrom}`);
    if (input.dateTo) summaryConds.push(sql`business_date <= ${input.dateTo}`);
    if (input.search) {
      const searchPattern = `%${input.search}%`;
      summaryConds.push(
        sql`(source_label ILIKE ${searchPattern} OR customer_name ILIKE ${searchPattern} OR reference_number ILIKE ${searchPattern})`,
      );
    }
    if (input.status) summaryConds.push(sql`status = ${input.status}`);
    if (input.paymentMethod) summaryConds.push(sql`payment_method = ${input.paymentMethod}`);
    const summaryWhereClause = sql.join(summaryConds, sql` AND `);

    // Run items + summary in parallel
    const [itemsResult, summaryResult, bySourceResult] = await Promise.all([
      (tx as any).execute(sql`
        SELECT
          id, source, source_sub_type,
          COALESCE(source_sub_type, source) AS effective_source,
          source_id, source_label,
          reference_number, customer_name, customer_id,
          employee_id, employee_name,
          amount_dollars, subtotal_dollars, tax_dollars,
          discount_dollars, tip_dollars, service_charge_dollars,
          payment_method, status, occurred_at, business_date, metadata
        FROM rm_revenue_activity
        WHERE ${whereClause}
        ORDER BY ${orderBy}
        LIMIT ${limit + 1}
      `),
      (tx as any).execute(sql`
        SELECT
          COALESCE(SUM(CASE WHEN status != 'voided' THEN amount_dollars ELSE 0 END), 0) AS total_amount,
          COUNT(*) AS total_count
        FROM rm_revenue_activity
        WHERE ${summaryWhereClause}
      `),
      (tx as any).execute(sql`
        SELECT
          COALESCE(source_sub_type, source) AS effective_source,
          COALESCE(SUM(CASE WHEN status != 'voided' THEN amount_dollars ELSE 0 END), 0) AS total_amount,
          COUNT(*) AS count
        FROM rm_revenue_activity
        WHERE ${summaryWhereClause}
        GROUP BY COALESCE(source_sub_type, source)
        ORDER BY total_amount DESC
      `),
    ]);

    const allRows = Array.from(itemsResult as Iterable<Record<string, unknown>>);
    const hasMore = allRows.length > limit;
    const items = hasMore ? allRows.slice(0, limit) : allRows;

    const summaryRows = Array.from(summaryResult as Iterable<Record<string, unknown>>);
    const bySourceRows = Array.from(bySourceResult as Iterable<Record<string, unknown>>);

    return {
      items: items.map((row) => ({
        id: String(row.id),
        source: String(row.source),
        sourceSubType: row.source_sub_type ? String(row.source_sub_type) : null,
        effectiveSource: String(row.effective_source),
        sourceId: String(row.source_id),
        sourceLabel: String(row.source_label ?? ''),
        referenceNumber: row.reference_number ? String(row.reference_number) : null,
        customerName: row.customer_name ? String(row.customer_name) : null,
        customerId: row.customer_id ? String(row.customer_id) : null,
        employeeId: row.employee_id ? String(row.employee_id) : null,
        employeeName: row.employee_name ? String(row.employee_name) : null,
        amountDollars: Number(row.amount_dollars) || 0,
        subtotalDollars: Number(row.subtotal_dollars) || 0,
        taxDollars: Number(row.tax_dollars) || 0,
        discountDollars: Number(row.discount_dollars) || 0,
        tipDollars: Number(row.tip_dollars) || 0,
        serviceChargeDollars: Number(row.service_charge_dollars) || 0,
        paymentMethod: row.payment_method ? String(row.payment_method) : null,
        status: String(row.status),
        occurredAt: row.occurred_at instanceof Date
          ? row.occurred_at.toISOString()
          : String(row.occurred_at ?? ''),
        businessDate: String(row.business_date ?? ''),
        metadata: row.metadata as Record<string, unknown> | null,
      })),
      summary: {
        totalAmount: Number(summaryRows[0]?.total_amount) || 0,
        totalCount: Number(summaryRows[0]?.total_count) || 0,
        bySource: bySourceRows.map((row) => ({
          source: String(row.effective_source),
          totalAmount: Number(row.total_amount) || 0,
          count: Number(row.count) || 0,
        })),
      },
      cursor: hasMore && items.length > 0 ? String(items[items.length - 1]!.id) : null,
      hasMore,
    };
  });
}
