import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { num, safeDivide, toBps, courseFilterSql } from '../queries/_shared';

export interface GetPaceKpisInput {
  tenantId: string;
  courseId?: string;
  locationId?: string;
  dateFrom: string;
  dateTo: string;
}

export interface PaceKpis {
  roundsCompleted: number;
  avgRoundDurationMin: number;
  slowRoundsCount: number;
  slowRoundPctBps: number;
  avgMinutesPerHole: number;
  startsCount: number;
  lateStartsCount: number;
  avgStartDelayMin: number;
  intervalComplianceBps: number;
}

/**
 * Aggregate pace-of-play KPIs from rm_golf_pace_daily + rm_golf_ops_daily.
 *
 * Two queries — one for pace, one for ops. All averages are recomputed from
 * raw totals (weighted aggregation, not average of averages per CLAUDE.md §81).
 */
export async function getPaceKpis(input: GetPaceKpisInput): Promise<PaceKpis> {
  const cf = courseFilterSql(input.tenantId, input.courseId, input.locationId);

  return withTenant(input.tenantId, async (tx) => {
    // Query 1: Pace daily
    const paceResult = await (tx as any).execute(sql`
      SELECT
        COALESCE(SUM(rounds_completed), 0)  AS rounds_completed,
        COALESCE(SUM(total_duration_min), 0) AS total_duration_min,
        COALESCE(SUM(slow_rounds_count), 0)  AS slow_rounds_count
      FROM rm_golf_pace_daily
      WHERE tenant_id = ${input.tenantId}
        AND business_date >= ${input.dateFrom}
        AND business_date <= ${input.dateTo}
        ${cf}
    `);
    const paceRows = Array.from(paceResult as Iterable<{
      rounds_completed: string;
      total_duration_min: string;
      slow_rounds_count: string;
    }>);
    const p = paceRows[0]!;

    // Query 2: Ops daily
    const opsResult = await (tx as any).execute(sql`
      SELECT
        COALESCE(SUM(starts_count), 0)          AS starts_count,
        COALESCE(SUM(late_starts_count), 0)      AS late_starts_count,
        COALESCE(SUM(total_start_delay_min), 0)  AS total_start_delay_min
      FROM rm_golf_ops_daily
      WHERE tenant_id = ${input.tenantId}
        AND business_date >= ${input.dateFrom}
        AND business_date <= ${input.dateTo}
        ${cf}
    `);
    const opsRows = Array.from(opsResult as Iterable<{
      starts_count: string;
      late_starts_count: string;
      total_start_delay_min: string;
    }>);
    const o = opsRows[0]!;

    const roundsCompleted = num(p.rounds_completed);
    const totalDurationMin = num(p.total_duration_min);
    const slowRoundsCount = num(p.slow_rounds_count);

    const startsCount = num(o.starts_count);
    const lateStartsCount = num(o.late_starts_count);
    const totalStartDelayMin = num(o.total_start_delay_min);

    return {
      roundsCompleted,
      avgRoundDurationMin: Math.round(safeDivide(totalDurationMin, roundsCompleted) * 100) / 100,
      slowRoundsCount,
      slowRoundPctBps: toBps(safeDivide(slowRoundsCount, roundsCompleted)),
      avgMinutesPerHole: Math.round(safeDivide(totalDurationMin, roundsCompleted * 18) * 100) / 100,
      startsCount,
      lateStartsCount,
      avgStartDelayMin: Math.round(safeDivide(totalStartDelayMin, startsCount) * 100) / 100,
      intervalComplianceBps: toBps(safeDivide(startsCount - lateStartsCount, startsCount)),
    };
  });
}
