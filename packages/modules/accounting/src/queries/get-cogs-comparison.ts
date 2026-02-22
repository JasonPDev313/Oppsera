import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface CogsComparisonResult {
  periodStart: string;
  periodEnd: string;
  perpetualCogsDollars: string;
  periodicCogsDollars: string | null;
  varianceDollars: string | null;
  variancePercent: string | null;
}

/**
 * Compare perpetual COGS (from GL journal lines sourced by POS adapter)
 * with periodic COGS (from periodic_cogs_calculations) for the same period.
 *
 * Useful for tenants transitioning between modes or auditing accuracy.
 */
export async function getCogsComparison(
  tenantId: string,
  periodStart: string,
  periodEnd: string,
  locationId?: string,
): Promise<CogsComparisonResult> {
  return withTenant(tenantId, async (tx) => {
    const locationFilter = locationId
      ? sql`AND jl.location_id = ${locationId}`
      : sql``;

    // Perpetual COGS: SUM of COGS debits from POS adapter GL postings
    const perpetualRows = await tx.execute(sql`
      SELECT COALESCE(SUM(CAST(jl.debit_amount AS NUMERIC(12,2))), 0) AS total
      FROM gl_journal_lines jl
      JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
      JOIN gl_accounts ga ON ga.id = jl.account_id
      WHERE je.tenant_id = ${tenantId}
        AND je.source_module = 'pos'
        AND je.status = 'posted'
        AND je.business_date >= ${periodStart}
        AND je.business_date <= ${periodEnd}
        AND ga.tenant_id = ${tenantId}
        AND ga.name ILIKE '%cost of goods%'
        AND CAST(jl.debit_amount AS NUMERIC) > 0
        ${locationFilter}
    `);
    const perpetualArr = Array.from(perpetualRows as Iterable<Record<string, unknown>>);

    const perpetualCogs = Number(perpetualArr[0]?.total ?? '0');

    // Periodic COGS: from the calculation table
    const locationFilterPeriodic = locationId
      ? sql`AND location_id = ${locationId}`
      : sql`AND location_id IS NULL`;

    const periodicRows = await tx.execute(sql`
      SELECT cogs_dollars
      FROM periodic_cogs_calculations
      WHERE tenant_id = ${tenantId}
        AND status = 'posted'
        AND period_start = ${periodStart}
        AND period_end = ${periodEnd}
        ${locationFilterPeriodic}
      LIMIT 1
    `);
    const periodicArr = Array.from(periodicRows as Iterable<Record<string, unknown>>);

    const periodicCogsDollars = periodicArr.length > 0 ? String(periodicArr[0]!.cogs_dollars) : null;
    const periodicCogs = periodicCogsDollars ? Number(periodicCogsDollars) : null;

    let varianceDollars: string | null = null;
    let variancePercent: string | null = null;

    if (periodicCogs !== null) {
      const variance = perpetualCogs - periodicCogs;
      varianceDollars = variance.toFixed(2);
      if (perpetualCogs > 0) {
        variancePercent = ((variance / perpetualCogs) * 100).toFixed(2);
      }
    }

    return {
      periodStart,
      periodEnd,
      perpetualCogsDollars: perpetualCogs.toFixed(2),
      periodicCogsDollars: periodicCogs?.toFixed(2) ?? null,
      varianceDollars,
      variancePercent,
    };
  });
}
