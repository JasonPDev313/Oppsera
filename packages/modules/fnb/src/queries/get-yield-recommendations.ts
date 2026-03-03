import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import {
  generateYieldRecommendations,
} from '../services/revpash-calculator';
import type { YieldRecommendation, DemandSlot } from '../services/revpash-calculator';

export type { YieldRecommendation };

export interface GetYieldRecommendationsInput {
  tenantId: string;
  locationId: string;
  date: string;             // YYYY-MM-DD
  targetUtilization?: number;    // default 0.85
  maxOverbookPercent?: number;   // default 10
}

/**
 * Fetch active pacing rules for the date, aggregate reservation covers
 * per interval, then call generateYieldRecommendations().
 */
export async function getYieldRecommendations(
  input: GetYieldRecommendationsInput,
): Promise<YieldRecommendation[]> {
  const {
    tenantId,
    locationId,
    date,
    targetUtilization = 0.85,
    maxOverbookPercent = 10,
  } = input;

  // Derive day-of-week from date
  const [year, month, day] = date.split('-').map(Number);
  const dateObj = new Date(year!, month! - 1, day!);
  const dayOfWeek = dateObj.getDay();

  return withTenant(tenantId, async (tx) => {
    // 1. Load active pacing rules for this day
    const [pacingRows, reservationRows, tabRows, turnRows] = await Promise.all([
      tx.execute(sql`
        SELECT
          id,
          interval_start_time,
          interval_end_time,
          max_covers,
          meal_period,
          day_of_week,
          is_active
        FROM fnb_pacing_rules
        WHERE tenant_id = ${tenantId}
          AND location_id = ${locationId}
          AND is_active = true
          AND (day_of_week IS NULL OR day_of_week = ${dayOfWeek})
        ORDER BY priority DESC, interval_start_time ASC NULLS LAST, id ASC
      `),

      // 2. Reservation covers per time slot (booked)
      tx.execute(sql`
        SELECT
          reservation_time AS time_slot,
          SUM(party_size)::int AS covers
        FROM fnb_reservations
        WHERE tenant_id = ${tenantId}
          AND location_id = ${locationId}
          AND reservation_date = ${date}
          AND status NOT IN ('canceled', 'no_show')
        GROUP BY reservation_time
      `),

      // 3. Walk-in covers from tabs (tabs opened today without a reservation)
      tx.execute(sql`
        SELECT
          EXTRACT(HOUR FROM opened_at)::int AS hour,
          SUM(party_size)::int AS covers
        FROM fnb_tabs
        WHERE tenant_id = ${tenantId}
          AND location_id = ${locationId}
          AND business_date = ${date}
          AND reservation_id IS NULL
          AND status NOT IN ('voided')
        GROUP BY EXTRACT(HOUR FROM opened_at)
      `),

      // 4. Average turn time from table turns for context
      tx.execute(sql`
        SELECT COALESCE(ROUND(AVG(avg_turn_time_minutes)), 0)::int AS avg_turn_minutes
        FROM rm_fnb_table_turns
        WHERE tenant_id = ${tenantId}
          AND location_id = ${locationId}
          AND business_date >= (${date}::date - INTERVAL '30 days')
          AND business_date <= ${date}
          AND avg_turn_time_minutes IS NOT NULL
      `),
    ]);

    const rules = Array.from(pacingRows as Iterable<Record<string, unknown>>).map((row) => ({
      intervalStartTime: row.interval_start_time ? String(row.interval_start_time) : '00:00',
      intervalEndTime: row.interval_end_time ? String(row.interval_end_time) : '23:59',
      maxCovers: Number(row.max_covers),
    }));

    if (rules.length === 0) return [];

    // Build a helper to convert HH:MM to minutes for overlap detection
    const toMinutes = (hhmm: string): number => {
      const [h, m] = hhmm.split(':').map(Number);
      return (h ?? 0) * 60 + (m ?? 0);
    };

    // Build booked covers map (reservation time → covers)
    const reservedCoversByTime = new Map<string, number>();
    for (const row of Array.from(reservationRows as Iterable<Record<string, unknown>>)) {
      const time = String(row.time_slot);
      reservedCoversByTime.set(time, Number(row.covers ?? 0));
    }

    // Build walk-in covers map (hour → covers)
    const walkinCoversByHour = new Map<number, number>();
    for (const row of Array.from(tabRows as Iterable<Record<string, unknown>>)) {
      walkinCoversByHour.set(Number(row.hour ?? 0), Number(row.covers ?? 0));
    }

    const turnRow = Array.from(turnRows as Iterable<Record<string, unknown>>)[0] ?? {};
    const avgTurnMinutes = Number(turnRow.avg_turn_minutes ?? 45);

    // Build DemandSlot[] — one per rule interval
    const actualDemand: DemandSlot[] = rules.map((rule) => {
      const intervalLabel = `${rule.intervalStartTime}-${rule.intervalEndTime}`;
      const startMin = toMinutes(rule.intervalStartTime);
      const endMin = toMinutes(rule.intervalEndTime);

      // Sum booked (reservation) covers whose time falls in this interval
      let bookedCovers = 0;
      for (const [timeStr, covers] of reservedCoversByTime.entries()) {
        const t = toMinutes(timeStr);
        if (t >= startMin && t <= endMin) {
          bookedCovers += covers;
        }
      }

      // Sum walk-in covers whose hour falls in the interval
      let walkinCovers = 0;
      for (const [hour, covers] of walkinCoversByHour.entries()) {
        const hourMin = hour * 60;
        if (hourMin >= startMin && hourMin <= endMin) {
          walkinCovers += covers;
        }
      }

      return { interval: intervalLabel, bookedCovers, walkinCovers };
    });

    return generateYieldRecommendations(rules, actualDemand, avgTurnMinutes, {
      targetUtilization,
      maxOverbookPercent,
    });
  });
}
