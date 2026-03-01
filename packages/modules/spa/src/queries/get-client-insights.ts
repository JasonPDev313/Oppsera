import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';
import { withTenant, rmSpaClientMetrics, customers } from '@oppsera/db';

// ── Types ────────────────────────────────────────────────────────

export interface GetClientInsightsInput {
  tenantId: string;
  startDate: string;      // YYYY-MM-DD
  endDate: string;        // YYYY-MM-DD
  customerId?: string;    // filter to specific customer
  sortBy?: 'spend' | 'visits' | 'recency'; // default: spend
  limit?: number;         // default 50
  cursor?: string;        // cursor for pagination (customerId)
}

export interface ClientInsightsRow {
  customerId: string;
  customerName: string;
  visitCount: number;
  totalSpend: number;           // dollars
  serviceCount: number;
  addonCount: number;
  packagePurchases: number;
  packageRedemptions: number;
  cancelCount: number;
  noShowCount: number;
  tipTotal: number;             // dollars
  lastVisitDate: string | null;
  daysSinceLastVisit: number;
  avgSpendPerVisit: number;     // dollars
}

export interface GetClientInsightsResult {
  items: ClientInsightsRow[];
  cursor: string | null;
  hasMore: boolean;
}

// ── Query ────────────────────────────────────────────────────────

/**
 * Aggregate client insights from the rm_spa_client_metrics read model.
 * Groups by customerId across the date range, resolves customer names,
 * and supports cursor-based pagination.
 */
export async function getClientInsights(
  input: GetClientInsightsInput,
): Promise<GetClientInsightsResult> {
  const limit = input.limit ?? 50;
  const sortBy = input.sortBy ?? 'spend';

  return withTenant(input.tenantId, async (tx) => {
    // Build conditions
    const conditions: ReturnType<typeof eq>[] = [
      eq(rmSpaClientMetrics.tenantId, input.tenantId),
      gte(rmSpaClientMetrics.businessDate, input.startDate),
      lte(rmSpaClientMetrics.businessDate, input.endDate),
    ];

    if (input.customerId) {
      conditions.push(eq(rmSpaClientMetrics.customerId, input.customerId));
    }

    // Sort expression
    const orderByExpr = (() => {
      switch (sortBy) {
        case 'visits':
          return desc(sql`sum(${rmSpaClientMetrics.visitCount})`);
        case 'recency':
          return desc(sql`max(${rmSpaClientMetrics.lastVisitDate})`);
        default:
          return desc(sql`sum(${rmSpaClientMetrics.totalSpend}::numeric)`);
      }
    })();

    // Cursor condition: for pagination, exclude customers already seen
    // We use the customerId as cursor since results are sorted by aggregate
    const cursorCondition = input.cursor
      ? sql`${rmSpaClientMetrics.customerId} > ${input.cursor}`
      : sql`TRUE`;

    // 1. Aggregate client metrics
    const metricsRows = await tx
      .select({
        customerId: rmSpaClientMetrics.customerId,
        visitCount: sql<number>`sum(${rmSpaClientMetrics.visitCount})::int`,
        totalSpend: sql<number>`sum(${rmSpaClientMetrics.totalSpend}::numeric)::numeric`,
        serviceCount: sql<number>`sum(${rmSpaClientMetrics.serviceCount})::int`,
        addonCount: sql<number>`sum(${rmSpaClientMetrics.addonCount})::int`,
        packagePurchases: sql<number>`sum(${rmSpaClientMetrics.packagePurchases})::int`,
        packageRedemptions: sql<number>`sum(${rmSpaClientMetrics.packageRedemptions})::int`,
        cancelCount: sql<number>`sum(${rmSpaClientMetrics.cancelCount})::int`,
        noShowCount: sql<number>`sum(${rmSpaClientMetrics.noShowCount})::int`,
        tipTotal: sql<number>`sum(${rmSpaClientMetrics.tipTotal}::numeric)::numeric`,
        lastVisitDate: sql<string | null>`max(${rmSpaClientMetrics.lastVisitDate})`,
        daysSinceLastVisit: sql<number>`min(${rmSpaClientMetrics.daysSinceLastVisit})::int`,
      })
      .from(rmSpaClientMetrics)
      .where(and(...conditions, cursorCondition))
      .groupBy(rmSpaClientMetrics.customerId)
      .orderBy(orderByExpr)
      .limit(limit + 1);

    const hasMore = metricsRows.length > limit;
    const rows = hasMore ? metricsRows.slice(0, limit) : metricsRows;

    if (rows.length === 0) {
      return { items: [], cursor: null, hasMore: false };
    }

    // 2. Resolve customer names
    const customerIds = rows.map((r) => r.customerId);
    const customerRows = await tx
      .select({ id: customers.id, displayName: customers.displayName })
      .from(customers)
      .where(
        and(
          eq(customers.tenantId, input.tenantId),
          sql`${customers.id} IN (${sql.join(
            customerIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        ),
      );

    const nameMap = new Map(customerRows.map((c) => [c.id, c.displayName]));

    // 3. Map and compute derived fields
    const items: ClientInsightsRow[] = rows.map((r) => {
      const visitCount = r.visitCount;
      const totalSpend = Number(r.totalSpend);
      const avgSpendPerVisit =
        visitCount > 0
          ? Math.round((totalSpend / visitCount) * 100) / 100
          : 0;

      return {
        customerId: r.customerId,
        customerName: nameMap.get(r.customerId) ?? 'Unknown',
        visitCount,
        totalSpend,
        serviceCount: r.serviceCount,
        addonCount: r.addonCount,
        packagePurchases: r.packagePurchases,
        packageRedemptions: r.packageRedemptions,
        cancelCount: r.cancelCount,
        noShowCount: r.noShowCount,
        tipTotal: Number(r.tipTotal),
        lastVisitDate: r.lastVisitDate ?? null,
        daysSinceLastVisit: r.daysSinceLastVisit,
        avgSpendPerVisit,
      };
    });

    const nextCursor = hasMore ? rows[rows.length - 1]!.customerId : null;

    return { items, cursor: nextCursor, hasMore };
  });
}
