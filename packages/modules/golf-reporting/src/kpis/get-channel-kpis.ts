import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { num, safeDivide, toBps, courseFilterSql } from '../queries/_shared';

export interface GetChannelKpisInput {
  tenantId: string;
  courseId?: string;
  locationId?: string;
  dateFrom: string;
  dateTo: string;
}

export interface ChannelKpis {
  onlineSlots: number;
  proshopSlots: number;
  phoneSlots: number;
  totalSlots: number;
  onlinePctBps: number;
  proshopPctBps: number;
  phonePctBps: number;
  memberRounds: number;
  publicRounds: number;
  leagueRounds: number;
  outingRounds: number;
  bookingCount: number;
  avgLeadTimeHours: number;
  lastMinuteCount: number;
  advancedCount: number;
  lastMinutePctBps: number;
  advancedPctBps: number;
}

/**
 * Aggregate channel & booking KPIs from rm_golf_channel_daily.
 *
 * All percentages are computed from raw totals, not averaged per-day (CLAUDE.md §81).
 */
export async function getChannelKpis(input: GetChannelKpisInput): Promise<ChannelKpis> {
  const cf = courseFilterSql(input.tenantId, input.courseId, input.locationId);

  return withTenant(input.tenantId, async (tx) => {
    const result = await (tx as any).execute(sql`
      SELECT
        COALESCE(SUM(online_slots_booked), 0)   AS online_slots,
        COALESCE(SUM(proshop_slots_booked), 0)  AS proshop_slots,
        COALESCE(SUM(phone_slots_booked), 0)    AS phone_slots,
        COALESCE(SUM(member_rounds), 0)         AS member_rounds,
        COALESCE(SUM(public_rounds), 0)         AS public_rounds,
        COALESCE(SUM(league_rounds), 0)         AS league_rounds,
        COALESCE(SUM(outing_rounds), 0)         AS outing_rounds,
        COALESCE(SUM(booking_count), 0)         AS booking_count,
        COALESCE(SUM(total_lead_time_hours), 0) AS total_lead_time_hours,
        COALESCE(SUM(last_minute_count), 0)     AS last_minute_count,
        COALESCE(SUM(advanced_count), 0)        AS advanced_count
      FROM rm_golf_channel_daily
      WHERE tenant_id = ${input.tenantId}
        AND business_date >= ${input.dateFrom}
        AND business_date <= ${input.dateTo}
        ${cf}
    `);
    const rows = Array.from(result as Iterable<{
      online_slots: string;
      proshop_slots: string;
      phone_slots: string;
      member_rounds: string;
      public_rounds: string;
      league_rounds: string;
      outing_rounds: string;
      booking_count: string;
      total_lead_time_hours: string;
      last_minute_count: string;
      advanced_count: string;
    }>);
    const r = rows[0]!;

    const onlineSlots = num(r.online_slots);
    const proshopSlots = num(r.proshop_slots);
    const phoneSlots = num(r.phone_slots);
    const totalSlots = onlineSlots + proshopSlots + phoneSlots;

    const bookingCount = num(r.booking_count);
    const totalLeadTimeHours = num(r.total_lead_time_hours);
    const lastMinuteCount = num(r.last_minute_count);
    const advancedCount = num(r.advanced_count);

    return {
      onlineSlots,
      proshopSlots,
      phoneSlots,
      totalSlots,
      onlinePctBps: toBps(safeDivide(onlineSlots, totalSlots)),
      proshopPctBps: toBps(safeDivide(proshopSlots, totalSlots)),
      phonePctBps: toBps(safeDivide(phoneSlots, totalSlots)),
      memberRounds: num(r.member_rounds),
      publicRounds: num(r.public_rounds),
      leagueRounds: num(r.league_rounds),
      outingRounds: num(r.outing_rounds),
      bookingCount,
      avgLeadTimeHours: Math.round(safeDivide(totalLeadTimeHours, bookingCount) * 100) / 100,
      lastMinuteCount,
      advancedCount,
      lastMinutePctBps: toBps(safeDivide(lastMinuteCount, bookingCount)),
      advancedPctBps: toBps(safeDivide(advancedCount, bookingCount)),
    };
  });
}
