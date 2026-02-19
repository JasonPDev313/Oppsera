import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { num, safeDivide } from './_shared';

// ── getGolfCustomers — Paginated list ─────────────────────────

export interface GetGolfCustomersInput {
  tenantId: string;
  limit?: number;
  cursor?: string;
  sortBy?: 'totalRounds' | 'totalRevenue' | 'lastPlayedAt' | 'customerName';
  sortDir?: 'asc' | 'desc';
}

export interface GolfCustomerRow {
  id: string;
  customerId: string;
  customerName: string | null;
  totalRounds: number;
  totalRevenue: number;
  lastPlayedAt: string | null;
  avgPartySize: number;
}

export interface GolfCustomerListResult {
  items: GolfCustomerRow[];
  cursor: string | null;
  hasMore: boolean;
}

const SORT_COLUMNS: Record<string, string> = {
  totalRounds: 'total_rounds',
  totalRevenue: 'total_revenue',
  lastPlayedAt: 'last_played_at',
  customerName: 'customer_name',
};

/**
 * Paginated golf customer list from rm_golf_customer_play.
 *
 * Cursor-based pagination using row id. Limit capped at 200.
 */
export async function getGolfCustomers(input: GetGolfCustomersInput): Promise<GolfCustomerListResult> {
  const limit = Math.min(input.limit ?? 50, 200);
  const sortCol = SORT_COLUMNS[input.sortBy ?? 'totalRounds'] ?? 'total_rounds';
  const sortDir = input.sortDir === 'asc' ? 'ASC' : 'DESC';

  return withTenant(input.tenantId, async (tx) => {
    const cursorClause = input.cursor
      ? sql`AND id < ${input.cursor}`
      : sql``;

    const result = await (tx as any).execute(sql`
      SELECT
        id, customer_id, customer_name, total_rounds,
        total_revenue, last_played_at, avg_party_size
      FROM rm_golf_customer_play
      WHERE tenant_id = ${input.tenantId}
        ${cursorClause}
      ORDER BY ${sql.raw(sortCol)} ${sql.raw(sortDir)}, id DESC
      LIMIT ${limit + 1}
    `);
    const rows = Array.from(result as Iterable<{
      id: string;
      customer_id: string;
      customer_name: string | null;
      total_rounds: string;
      total_revenue: string;
      last_played_at: string | null;
      avg_party_size: string;
    }>);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return {
      items: items.map((r) => ({
        id: r.id,
        customerId: r.customer_id,
        customerName: r.customer_name,
        totalRounds: num(r.total_rounds),
        totalRevenue: num(r.total_revenue),
        lastPlayedAt: r.last_played_at ?? null,
        avgPartySize: num(r.avg_party_size),
      })),
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}

// ── getGolfCustomerKpis — Aggregate stats ─────────────────────

export interface GetGolfCustomerKpisInput {
  tenantId: string;
}

export interface GolfCustomerKpis {
  totalCustomers: number;
  totalRounds: number;
  totalRevenue: number;
  avgRoundsPerCustomer: number;
  avgRevenuePerCustomer: number;
}

/**
 * Aggregate golf customer KPIs from rm_golf_customer_play.
 */
export async function getGolfCustomerKpis(input: GetGolfCustomerKpisInput): Promise<GolfCustomerKpis> {
  return withTenant(input.tenantId, async (tx) => {
    const result = await (tx as any).execute(sql`
      SELECT
        COUNT(*)::int                            AS total_customers,
        COALESCE(SUM(total_rounds), 0)::int      AS total_rounds,
        COALESCE(SUM(total_revenue), 0)::numeric(19,4) AS total_revenue
      FROM rm_golf_customer_play
      WHERE tenant_id = ${input.tenantId}
    `);
    const rows = Array.from(result as Iterable<{
      total_customers: string;
      total_rounds: string;
      total_revenue: string;
    }>);
    const r = rows[0]!;

    const totalCustomers = num(r.total_customers);
    const totalRounds = num(r.total_rounds);
    const totalRevenue = num(r.total_revenue);

    return {
      totalCustomers,
      totalRounds,
      totalRevenue,
      avgRoundsPerCustomer: Math.round(safeDivide(totalRounds, totalCustomers) * 100) / 100,
      avgRevenuePerCustomer: Math.round(safeDivide(totalRevenue, totalCustomers) * 100) / 100,
    };
  });
}
