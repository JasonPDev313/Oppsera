/**
 * Activity by Day report — revenue/debit department breakdown
 * for a single business date, with period-to-date and year-to-date totals.
 *
 * Mirrors the Jonas Chorum "Daily Activity Report" layout.
 */
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { pmsFolioEntries, pmsFolios } from '@oppsera/db';

export interface ActivityByDayRow {
  code: string;
  description: string;
  /** Daily totals (cents) */
  grossCents: number;
  adjustCents: number;
  netCents: number;
  /** Period-to-date (first of month → businessDate) */
  ptdGrossCents: number;
  ptdAdjustCents: number;
  ptdNetCents: number;
  /** Year-to-date (Jan 1 → businessDate) */
  ytdGrossCents: number;
  ytdAdjustCents: number;
  ytdNetCents: number;
}

export interface ActivityByDayResult {
  businessDate: string;
  propertyId: string;
  rows: ActivityByDayRow[];
  /** Grand totals */
  totals: {
    grossCents: number;
    adjustCents: number;
    netCents: number;
    ptdGrossCents: number;
    ptdAdjustCents: number;
    ptdNetCents: number;
    ytdGrossCents: number;
    ytdAdjustCents: number;
    ytdNetCents: number;
  };
}

const ZERO_TOTALS = {
  grossCents: 0,
  adjustCents: 0,
  netCents: 0,
  ptdGrossCents: 0,
  ptdAdjustCents: 0,
  ptdNetCents: 0,
  ytdGrossCents: 0,
  ytdAdjustCents: 0,
  ytdNetCents: 0,
} as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Max department groups returned — defensive limit */
const MAX_ROWS = 500;

/**
 * Derive month-start and year-start from a validated YYYY-MM-DD string.
 * Returns null if the input is malformed.
 */
function deriveDateBounds(businessDate: string): { monthStart: string; yearStart: string } | null {
  if (!DATE_RE.test(businessDate)) return null;
  const year = businessDate.slice(0, 4);
  const monthPrefix = businessDate.slice(0, 7); // YYYY-MM
  return {
    monthStart: `${monthPrefix}-01`,
    yearStart: `${year}-01-01`,
  };
}

/**
 * Aggregate folio entries by department code / entry type,
 * returning gross (charges), adjust (adjustments), and net for
 * the given day, period-to-date, and year-to-date.
 *
 * Grouping key: coalesce(department_code, entry_type)
 * Description: first non-null description per group
 */
export async function getActivityByDay(
  tenantId: string,
  propertyId: string,
  businessDate: string,
): Promise<ActivityByDayResult> {
  const bounds = deriveDateBounds(businessDate);
  if (!bounds) {
    return { businessDate, propertyId, rows: [], totals: { ...ZERO_TOTALS } };
  }
  const { monthStart, yearStart } = bounds;

  return withTenant(tenantId, async (tx) => {
    // Single query with conditional aggregation for day / PTD / YTD
    const rows = await tx
      .select({
        code: sql<string>`coalesce(${pmsFolioEntries.departmentCode}, ${pmsFolioEntries.entryType})`,
        description: sql<string>`min(${pmsFolioEntries.description})`,
        // Daily
        grossCents: sql<number>`coalesce(sum(case when ${pmsFolioEntries.businessDate} = ${businessDate} and ${pmsFolioEntries.entryType} != 'ADJUSTMENT' then ${pmsFolioEntries.amountCents} else 0 end), 0)::int`,
        adjustCents: sql<number>`coalesce(sum(case when ${pmsFolioEntries.businessDate} = ${businessDate} and ${pmsFolioEntries.entryType} = 'ADJUSTMENT' then ${pmsFolioEntries.amountCents} else 0 end), 0)::int`,
        // PTD
        ptdGrossCents: sql<number>`coalesce(sum(case when ${pmsFolioEntries.businessDate} >= ${monthStart} and ${pmsFolioEntries.entryType} != 'ADJUSTMENT' then ${pmsFolioEntries.amountCents} else 0 end), 0)::int`,
        ptdAdjustCents: sql<number>`coalesce(sum(case when ${pmsFolioEntries.businessDate} >= ${monthStart} and ${pmsFolioEntries.entryType} = 'ADJUSTMENT' then ${pmsFolioEntries.amountCents} else 0 end), 0)::int`,
        // YTD
        ytdGrossCents: sql<number>`coalesce(sum(case when ${pmsFolioEntries.entryType} != 'ADJUSTMENT' then ${pmsFolioEntries.amountCents} else 0 end), 0)::int`,
        ytdAdjustCents: sql<number>`coalesce(sum(case when ${pmsFolioEntries.entryType} = 'ADJUSTMENT' then ${pmsFolioEntries.amountCents} else 0 end), 0)::int`,
      })
      .from(pmsFolioEntries)
      .innerJoin(pmsFolios, eq(pmsFolioEntries.folioId, pmsFolios.id))
      .where(
        and(
          eq(pmsFolioEntries.tenantId, tenantId),
          // Defense-in-depth: filter both sides of the join by tenant
          eq(pmsFolios.tenantId, tenantId),
          eq(pmsFolios.propertyId, propertyId),
          gte(pmsFolioEntries.businessDate, yearStart),
          lte(pmsFolioEntries.businessDate, businessDate),
          // Exclude payments & refunds — this is a revenue/debit report
          sql`${pmsFolioEntries.entryType} NOT IN ('PAYMENT', 'REFUND')`,
        ),
      )
      .groupBy(
        sql`coalesce(${pmsFolioEntries.departmentCode}, ${pmsFolioEntries.entryType})`,
      )
      .orderBy(
        sql`coalesce(${pmsFolioEntries.departmentCode}, ${pmsFolioEntries.entryType})`,
      )
      .limit(MAX_ROWS);

    const mapped: ActivityByDayRow[] = rows.map((r) => ({
      code: r.code,
      description: r.description,
      grossCents: r.grossCents,
      adjustCents: r.adjustCents,
      netCents: r.grossCents + r.adjustCents,
      ptdGrossCents: r.ptdGrossCents,
      ptdAdjustCents: r.ptdAdjustCents,
      ptdNetCents: r.ptdGrossCents + r.ptdAdjustCents,
      ytdGrossCents: r.ytdGrossCents,
      ytdAdjustCents: r.ytdAdjustCents,
      ytdNetCents: r.ytdGrossCents + r.ytdAdjustCents,
    }));

    type Totals = ActivityByDayResult['totals'];
    const totals = mapped.reduce<Totals>(
      (acc, r) => ({
        grossCents: acc.grossCents + r.grossCents,
        adjustCents: acc.adjustCents + r.adjustCents,
        netCents: acc.netCents + r.netCents,
        ptdGrossCents: acc.ptdGrossCents + r.ptdGrossCents,
        ptdAdjustCents: acc.ptdAdjustCents + r.ptdAdjustCents,
        ptdNetCents: acc.ptdNetCents + r.ptdNetCents,
        ytdGrossCents: acc.ytdGrossCents + r.ytdGrossCents,
        ytdAdjustCents: acc.ytdAdjustCents + r.ytdAdjustCents,
        ytdNetCents: acc.ytdNetCents + r.ytdNetCents,
      }),
      { ...ZERO_TOTALS },
    );

    return { businessDate, propertyId, rows: mapped, totals };
  });
}
