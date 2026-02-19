import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { num, safeDivide, toBps, courseFilterSql } from './_shared';

export interface GetGolfDashboardMetricsInput {
  tenantId: string;
  courseId?: string;
  locationId?: string;
  date?: string; // 'YYYY-MM-DD', defaults to today
}

export interface GolfDashboardMetrics {
  todayRoundsPlayed: number;
  todayRevenue: number;
  utilizationBps: number;
  avgRoundDurationMin: number;
  cancelRateBps: number;
  noShowRateBps: number;
  onlinePctBps: number;
}

/**
 * Golf dashboard summary metrics for a single date (default: today).
 *
 * 4 queries within one withTenant call:
 * 1. rm_golf_tee_time_demand  → utilization, cancelRate, noShowRate
 * 2. rm_golf_revenue_daily    → todayRounds, todayRevenue
 * 3. rm_golf_pace_daily       → avgRoundDuration
 * 4. rm_golf_channel_daily    → onlinePct
 */
export async function getGolfDashboardMetrics(
  input: GetGolfDashboardMetricsInput,
): Promise<GolfDashboardMetrics> {
  const date = input.date ?? new Date().toISOString().slice(0, 10);
  const cf = courseFilterSql(input.tenantId, input.courseId, input.locationId);

  return withTenant(input.tenantId, async (tx) => {
    // 1. Demand metrics
    const demandResult = await (tx as any).execute(sql`
      SELECT
        COALESCE(SUM(slots_booked), 0)    AS slots_booked,
        COALESCE(SUM(slots_available), 0) AS slots_available,
        COALESCE(SUM(cancellations), 0)   AS cancellations,
        COALESCE(SUM(no_shows), 0)        AS no_shows
      FROM rm_golf_tee_time_demand
      WHERE tenant_id = ${input.tenantId}
        AND business_date = ${date}
        ${cf}
    `);
    const dRows = Array.from(demandResult as Iterable<{
      slots_booked: string; slots_available: string; cancellations: string; no_shows: string;
    }>);
    const d = dRows[0]!;
    const booked = num(d.slots_booked);
    const available = num(d.slots_available);

    // 2. Revenue metrics
    const revResult = await (tx as any).execute(sql`
      SELECT
        COALESCE(SUM(rounds_played), 0)::int           AS rounds_played,
        COALESCE(SUM(total_revenue), 0)::numeric(19,4) AS total_revenue
      FROM rm_golf_revenue_daily
      WHERE tenant_id = ${input.tenantId}
        AND business_date = ${date}
        ${cf}
    `);
    const rRows = Array.from(revResult as Iterable<{
      rounds_played: string; total_revenue: string;
    }>);
    const r = rRows[0]!;

    // 3. Pace metrics
    const paceResult = await (tx as any).execute(sql`
      SELECT
        COALESCE(SUM(rounds_completed), 0)   AS rounds_completed,
        COALESCE(SUM(total_duration_min), 0) AS total_duration_min
      FROM rm_golf_pace_daily
      WHERE tenant_id = ${input.tenantId}
        AND business_date = ${date}
        ${cf}
    `);
    const pRows = Array.from(paceResult as Iterable<{
      rounds_completed: string; total_duration_min: string;
    }>);
    const p = pRows[0]!;

    // 4. Channel metrics
    const channelResult = await (tx as any).execute(sql`
      SELECT
        COALESCE(SUM(online_slots_booked), 0)  AS online_slots,
        COALESCE(SUM(proshop_slots_booked), 0) AS proshop_slots,
        COALESCE(SUM(phone_slots_booked), 0)   AS phone_slots
      FROM rm_golf_channel_daily
      WHERE tenant_id = ${input.tenantId}
        AND business_date = ${date}
        ${cf}
    `);
    const cRows = Array.from(channelResult as Iterable<{
      online_slots: string; proshop_slots: string; phone_slots: string;
    }>);
    const c = cRows[0]!;
    const onlineSlots = num(c.online_slots);
    const totalChannelSlots = onlineSlots + num(c.proshop_slots) + num(c.phone_slots);

    const roundsCompleted = num(p.rounds_completed);
    const totalDurationMin = num(p.total_duration_min);

    return {
      todayRoundsPlayed: num(r.rounds_played),
      todayRevenue: num(r.total_revenue),
      utilizationBps: toBps(safeDivide(booked, available)),
      avgRoundDurationMin: Math.round(safeDivide(totalDurationMin, roundsCompleted) * 100) / 100,
      cancelRateBps: toBps(safeDivide(num(d.cancellations), booked)),
      noShowRateBps: toBps(safeDivide(num(d.no_shows), booked)),
      onlinePctBps: toBps(safeDivide(onlineSlots, totalChannelSlots)),
    };
  });
}
