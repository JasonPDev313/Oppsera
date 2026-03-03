import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';

export interface RefreshHostAnalyticsInput {
  businessDate: string;  // YYYY-MM-DD
  locationId: string;
}

export interface RefreshHostAnalyticsResult {
  hourlySlots: number;
  waitlistAccuracy: number;
  seatingEfficiency: number;
}

/**
 * Refresh all three host analytics read models for a given business date.
 *
 * Re-materialises:
 *   rm_fnb_host_hourly          — per-hour slot aggregates
 *   rm_fnb_waitlist_accuracy    — quoted vs actual wait accuracy by meal period
 *   rm_fnb_seating_efficiency   — turn counts, utilisation, fill ratios by meal period
 *
 * Uses withTenant() directly (not publishWithOutbox) because this is a
 * read-model materialisation — no domain event, no idempotency key needed.
 * All upserts use ON CONFLICT so the function is safe to call multiple times.
 */
export async function refreshHostAnalytics(
  ctx: RequestContext,
  input: RefreshHostAnalyticsInput,
): Promise<RefreshHostAnalyticsResult> {
  const { tenantId } = ctx;
  const { businessDate, locationId } = input;

  return withTenant(tenantId, async (tx) => {
    // ─────────────────────────────────────────────────────────────────────
    // 1. rm_fnb_host_hourly
    //    Aggregate by hour_slot from multiple source tables.
    // ─────────────────────────────────────────────────────────────────────

    // Reservations per hour (by reservation_time)
    const resHourRows = await tx.execute(sql`
      SELECT
        EXTRACT(HOUR FROM reservation_time)::int AS hour_slot,
        meal_period,
        COUNT(*)::int                            AS total_reservations,
        COUNT(*) FILTER (WHERE status = 'no_show')::int AS no_show_count,
        COUNT(*) FILTER (WHERE status IN ('seated','completed'))::int AS seated_reservations
      FROM fnb_reservations
      WHERE tenant_id    = ${tenantId}
        AND location_id  = ${locationId}
        AND reservation_date = ${businessDate}::date
      GROUP BY hour_slot, meal_period
    `);
    const resHour = Array.from(resHourRows as Iterable<Record<string, unknown>>);

    // Waitlist adds per hour (by added_at)
    const wlHourRows = await tx.execute(sql`
      SELECT
        EXTRACT(HOUR FROM added_at)::int AS hour_slot,
        COUNT(*)::int                    AS total_waitlist_adds,
        COALESCE(AVG(actual_wait_minutes) FILTER (WHERE actual_wait_minutes IS NOT NULL), 0)::numeric AS avg_wait_minutes
      FROM fnb_waitlist_entries
      WHERE tenant_id   = ${tenantId}
        AND location_id = ${locationId}
        AND business_date = ${businessDate}::date
      GROUP BY hour_slot
    `);
    const wlHour = Array.from(wlHourRows as Iterable<Record<string, unknown>>);

    // Turn times per hour (by seated_at, completed turns only)
    const turnHourRows = await tx.execute(sql`
      SELECT
        EXTRACT(HOUR FROM seated_at)::int AS hour_slot,
        COALESCE(AVG(turn_time_minutes) FILTER (WHERE turn_time_minutes IS NOT NULL), 0)::numeric AS avg_turn_minutes,
        COALESCE(SUM(party_size), 0)::int AS total_covers,
        COUNT(*) FILTER (WHERE was_reservation = false)::int AS walk_ins
      FROM fnb_table_turn_log
      WHERE tenant_id   = ${tenantId}
        AND location_id = ${locationId}
        AND DATE(seated_at) = ${businessDate}::date
        AND cleared_at IS NOT NULL
      GROUP BY hour_slot
    `);
    const turnHour = Array.from(turnHourRows as Iterable<Record<string, unknown>>);

    // Revenue per hour (from fnb_tabs, closed tabs by closed/updated hour)
    const revHourRows = await tx.execute(sql`
      SELECT
        EXTRACT(HOUR FROM updated_at)::int AS hour_slot,
        COALESCE(SUM(total_cents), 0)::int AS revenue_cents
      FROM fnb_tabs
      WHERE tenant_id   = ${tenantId}
        AND location_id = ${locationId}
        AND business_date = ${businessDate}
        AND status = 'closed'
      GROUP BY hour_slot
    `);
    const revHour = Array.from(revHourRows as Iterable<Record<string, unknown>>);

    // Total active tables for utilisation denominator
    const tableCountRows = await tx.execute(sql`
      SELECT COUNT(*)::int AS total_tables
      FROM fnb_tables
      WHERE tenant_id   = ${tenantId}
        AND location_id = ${locationId}
        AND is_active   = true
    `);
    // Default to 0, not 1 — we guard the division in the loop so a location
    // with no active tables correctly produces 0% utilisation rather than a
    // misleadingly small but non-zero figure.
    const totalTables = Number(
      Array.from(tableCountRows as Iterable<Record<string, unknown>>)[0]?.total_tables ?? 0,
    );

    // Build a map of hour slots from all sources
    const hourSlotSet = new Set<number>();
    for (const r of resHour) hourSlotSet.add(Number(r.hour_slot));
    for (const r of wlHour) hourSlotSet.add(Number(r.hour_slot));
    for (const r of turnHour) hourSlotSet.add(Number(r.hour_slot));
    for (const r of revHour) hourSlotSet.add(Number(r.hour_slot));

    const resHourMap = new Map(resHour.map((r) => [Number(r.hour_slot), r]));
    const wlHourMap = new Map(wlHour.map((r) => [Number(r.hour_slot), r]));
    const turnHourMap = new Map(turnHour.map((r) => [Number(r.hour_slot), r]));
    const revHourMap = new Map(revHour.map((r) => [Number(r.hour_slot), r]));

    let hourlySlots = 0;

    for (const hourSlot of hourSlotSet) {
      const res = resHourMap.get(hourSlot) ?? {};
      const wl = wlHourMap.get(hourSlot) ?? {};
      const turn = turnHourMap.get(hourSlot) ?? {};
      const rev = revHourMap.get(hourSlot) ?? {};

      const totalCovers = Number(turn.total_covers ?? 0);
      const totalReservations = Number(res.total_reservations ?? 0);
      const walkIns = Number(turn.walk_ins ?? 0);
      const waitlistAdds = Number(wl.total_waitlist_adds ?? 0);
      const avgWaitMinutes = Number(wl.avg_wait_minutes ?? 0);
      const avgTurnMinutes = Number(turn.avg_turn_minutes ?? 0);
      const noShowCount = Number(res.no_show_count ?? 0);
      const revenueCents = Number(rev.revenue_cents ?? 0);
      const mealPeriod = res.meal_period ? String(res.meal_period) : null;

      // Utilisation: tables occupied this hour / total tables (simplified heuristic)
      // Seated count at this hour / totalTables * 100
      const seatedThisHour = Number(res.seated_reservations ?? 0) + walkIns;
      const utilPct = totalTables > 0
        ? Math.min(100, (seatedThisHour / totalTables) * 100)
        : 0;

      await tx.execute(sql`
        INSERT INTO rm_fnb_host_hourly (
          id, tenant_id, location_id, business_date, hour_slot, meal_period,
          total_covers, total_reservations, total_walk_ins, total_waitlist_adds,
          avg_wait_minutes, avg_turn_minutes, table_utilization_pct,
          no_show_count, revenue_cents, created_at, updated_at
        ) VALUES (
          ${generateUlid()}, ${tenantId}, ${locationId}, ${businessDate}::date,
          ${hourSlot}, ${mealPeriod},
          ${totalCovers}, ${totalReservations}, ${walkIns}, ${waitlistAdds},
          ${avgWaitMinutes}, ${avgTurnMinutes}, ${Number(utilPct.toFixed(2))},
          ${noShowCount}, ${revenueCents}, now(), now()
        )
        ON CONFLICT (tenant_id, location_id, business_date, hour_slot)
        DO UPDATE SET
          meal_period            = EXCLUDED.meal_period,
          total_covers           = EXCLUDED.total_covers,
          total_reservations     = EXCLUDED.total_reservations,
          total_walk_ins         = EXCLUDED.total_walk_ins,
          total_waitlist_adds    = EXCLUDED.total_waitlist_adds,
          avg_wait_minutes       = EXCLUDED.avg_wait_minutes,
          avg_turn_minutes       = EXCLUDED.avg_turn_minutes,
          table_utilization_pct  = EXCLUDED.table_utilization_pct,
          no_show_count          = EXCLUDED.no_show_count,
          revenue_cents          = EXCLUDED.revenue_cents,
          updated_at             = now()
      `);
      hourlySlots++;
    }

    // ─────────────────────────────────────────────────────────────────────
    // 2. rm_fnb_waitlist_accuracy
    //    Quoted vs actual wait times, grouped by meal period.
    // ─────────────────────────────────────────────────────────────────────

    const wlAccRows = await tx.execute(sql`
      SELECT
        COALESCE(we.meal_period_hint, 'all')  AS meal_period,
        COUNT(*)::int                          AS total_entries,
        COUNT(*) FILTER (WHERE quoted_wait_minutes IS NOT NULL)::int AS entries_with_quote,
        COALESCE(AVG(quoted_wait_minutes) FILTER (WHERE quoted_wait_minutes IS NOT NULL), 0)::numeric AS avg_quoted_minutes,
        COALESCE(AVG(actual_wait_minutes) FILTER (WHERE actual_wait_minutes IS NOT NULL), 0)::numeric AS avg_actual_minutes,
        COALESCE(AVG(actual_wait_minutes - quoted_wait_minutes) FILTER (
          WHERE quoted_wait_minutes IS NOT NULL AND actual_wait_minutes IS NOT NULL
        ), 0)::numeric AS avg_error_minutes,
        COUNT(*) FILTER (WHERE
          quoted_wait_minutes IS NOT NULL AND actual_wait_minutes IS NOT NULL
          AND (actual_wait_minutes - quoted_wait_minutes) > 2
        )::int AS under_estimates,
        COUNT(*) FILTER (WHERE
          quoted_wait_minutes IS NOT NULL AND actual_wait_minutes IS NOT NULL
          AND (actual_wait_minutes - quoted_wait_minutes) < -2
        )::int AS over_estimates,
        COUNT(*) FILTER (WHERE
          quoted_wait_minutes IS NOT NULL AND actual_wait_minutes IS NOT NULL
          AND ABS(actual_wait_minutes - quoted_wait_minutes) <= 2
        )::int AS exact_or_close
      FROM (
        SELECT
          w.*,
          CASE
            WHEN EXTRACT(HOUR FROM w.added_at) BETWEEN 6  AND 10 THEN 'breakfast'
            WHEN EXTRACT(HOUR FROM w.added_at) BETWEEN 11 AND 14 THEN 'lunch'
            WHEN EXTRACT(HOUR FROM w.added_at) BETWEEN 17 AND 22 THEN 'dinner'
            ELSE 'other'
          END AS meal_period_hint
        FROM fnb_waitlist_entries w
        WHERE w.tenant_id   = ${tenantId}
          AND w.location_id = ${locationId}
          AND w.business_date = ${businessDate}::date
          AND w.status = 'seated'
      ) we
      GROUP BY meal_period_hint
    `);
    const wlAccData = Array.from(wlAccRows as Iterable<Record<string, unknown>>);

    let waitlistAccuracy = 0;

    for (const row of wlAccData) {
      const mealPeriod = String(row.meal_period);
      const totalEntries = Number(row.total_entries ?? 0);
      const entriesWithQuote = Number(row.entries_with_quote ?? 0);
      const avgQuotedMinutes = Number(row.avg_quoted_minutes ?? 0);
      const avgActualMinutes = Number(row.avg_actual_minutes ?? 0);
      const avgErrorMinutes = Number(row.avg_error_minutes ?? 0);
      const underEstimates = Number(row.under_estimates ?? 0);
      const overEstimates = Number(row.over_estimates ?? 0);
      const exactOrClose = Number(row.exact_or_close ?? 0);

      // accuracy_pct = 100 - abs(avg_error / avg_quoted * 100), floored at 0
      const accuracyPct = entriesWithQuote > 0 && avgQuotedMinutes > 0
        ? Math.max(0, 100 - Math.abs((avgErrorMinutes / avgQuotedMinutes) * 100))
        : 0;

      await tx.execute(sql`
        INSERT INTO rm_fnb_waitlist_accuracy (
          id, tenant_id, location_id, business_date, meal_period,
          total_entries, entries_with_quote, avg_quoted_minutes, avg_actual_minutes,
          avg_error_minutes, accuracy_pct, under_estimates, over_estimates,
          exact_or_close, created_at, updated_at
        ) VALUES (
          ${generateUlid()}, ${tenantId}, ${locationId}, ${businessDate}::date,
          ${mealPeriod},
          ${totalEntries}, ${entriesWithQuote},
          ${Number(avgQuotedMinutes.toFixed(1))},
          ${Number(avgActualMinutes.toFixed(1))},
          ${Number(avgErrorMinutes.toFixed(1))},
          ${Number(accuracyPct.toFixed(2))},
          ${underEstimates}, ${overEstimates}, ${exactOrClose},
          now(), now()
        )
        ON CONFLICT (tenant_id, location_id, business_date, meal_period)
        DO UPDATE SET
          total_entries       = EXCLUDED.total_entries,
          entries_with_quote  = EXCLUDED.entries_with_quote,
          avg_quoted_minutes  = EXCLUDED.avg_quoted_minutes,
          avg_actual_minutes  = EXCLUDED.avg_actual_minutes,
          avg_error_minutes   = EXCLUDED.avg_error_minutes,
          accuracy_pct        = EXCLUDED.accuracy_pct,
          under_estimates     = EXCLUDED.under_estimates,
          over_estimates      = EXCLUDED.over_estimates,
          exact_or_close      = EXCLUDED.exact_or_close,
          updated_at          = now()
      `);
      waitlistAccuracy++;
    }

    // ─────────────────────────────────────────────────────────────────────
    // 3. rm_fnb_seating_efficiency
    //    Turn counts, utilisation, party/table ratio, by meal period.
    // ─────────────────────────────────────────────────────────────────────

    // Total capacity for the location
    const capacityRows = await tx.execute(sql`
      SELECT
        COUNT(*)::int                     AS table_count,
        COALESCE(SUM(capacity_max), 0)::int AS total_seats,
        COALESCE(AVG(capacity_max), 0)::numeric AS avg_table_size
      FROM fnb_tables
      WHERE tenant_id   = ${tenantId}
        AND location_id = ${locationId}
        AND is_active   = true
    `);
    const capRow = Array.from(capacityRows as Iterable<Record<string, unknown>>)[0] ?? {};
    // Default tableCount to 0 — divisions using it already guard with `tableCount > 0`
    // checks in the loop below, so using 0 here gives correct 0-values rather
    // than phantom percentages when the location has no active tables.
    const tableCount = Number(capRow.table_count ?? 0);
    const avgTableSize = Number(capRow.avg_table_size ?? 0);

    // Seating efficiency per meal period from turn log
    const effRows = await tx.execute(sql`
      SELECT
        meal_period,
        COUNT(*)::int                             AS total_seatings,
        COUNT(DISTINCT table_id)::int             AS tables_turned_count,
        COUNT(*) FILTER (WHERE was_reservation = false)::int AS walk_in_seatings,
        COUNT(*) FILTER (WHERE was_reservation = true)::int  AS reservation_seatings,
        COALESCE(AVG(party_size::numeric / NULLIF(${avgTableSize}, 0)), 0)::numeric AS avg_party_vs_table_size_ratio
      FROM fnb_table_turn_log
      WHERE tenant_id   = ${tenantId}
        AND location_id = ${locationId}
        AND DATE(seated_at) = ${businessDate}::date
        AND cleared_at IS NOT NULL
      GROUP BY meal_period
    `);
    const effData = Array.from(effRows as Iterable<Record<string, unknown>>);

    let seatingEfficiency = 0;

    for (const row of effData) {
      const mealPeriod = String(row.meal_period ?? 'all');
      const totalSeatings = Number(row.total_seatings ?? 0);
      const tablesTurnedCount = Number(row.tables_turned_count ?? 0);
      const walkInSeatings = Number(row.walk_in_seatings ?? 0);
      const reservationSeatings = Number(row.reservation_seatings ?? 0);
      const avgPartyVsTableSizeRatio = Number(row.avg_party_vs_table_size_ratio ?? 0);

      // avg_turns_per_table: total turns / total active tables
      const avgTurnsPerTable = tableCount > 0
        ? Number((totalSeatings / tableCount).toFixed(2))
        : 0;

      // capacity_utilization_pct: tables that turned / total tables * 100
      const capacityUtilizationPct = tableCount > 0
        ? Number(Math.min(100, (tablesTurnedCount / tableCount) * 100).toFixed(2))
        : 0;

      // reservation_fill_pct: reservation seatings / total seatings * 100
      const reservationFillPct = totalSeatings > 0
        ? Number(((reservationSeatings / totalSeatings) * 100).toFixed(2))
        : 0;

      // walk_in_pct: walk-in seatings / total seatings * 100
      const walkInPct = totalSeatings > 0
        ? Number(((walkInSeatings / totalSeatings) * 100).toFixed(2))
        : 0;

      await tx.execute(sql`
        INSERT INTO rm_fnb_seating_efficiency (
          id, tenant_id, location_id, business_date, meal_period,
          total_seatings, avg_seat_to_first_order_minutes,
          capacity_utilization_pct, avg_party_vs_table_size_ratio,
          tables_turned_count, avg_turns_per_table,
          reservation_fill_pct, walk_in_pct,
          created_at, updated_at
        ) VALUES (
          ${generateUlid()}, ${tenantId}, ${locationId}, ${businessDate}::date,
          ${mealPeriod},
          ${totalSeatings},
          0,
          ${capacityUtilizationPct},
          ${Number(avgPartyVsTableSizeRatio.toFixed(2))},
          ${tablesTurnedCount},
          ${avgTurnsPerTable},
          ${reservationFillPct},
          ${walkInPct},
          now(), now()
        )
        ON CONFLICT (tenant_id, location_id, business_date, meal_period)
        DO UPDATE SET
          total_seatings                  = EXCLUDED.total_seatings,
          avg_seat_to_first_order_minutes = EXCLUDED.avg_seat_to_first_order_minutes,
          capacity_utilization_pct        = EXCLUDED.capacity_utilization_pct,
          avg_party_vs_table_size_ratio   = EXCLUDED.avg_party_vs_table_size_ratio,
          tables_turned_count             = EXCLUDED.tables_turned_count,
          avg_turns_per_table             = EXCLUDED.avg_turns_per_table,
          reservation_fill_pct            = EXCLUDED.reservation_fill_pct,
          walk_in_pct                     = EXCLUDED.walk_in_pct,
          updated_at                      = now()
      `);
      seatingEfficiency++;
    }

    return { hourlySlots, waitlistAccuracy, seatingEfficiency };
  });
}
