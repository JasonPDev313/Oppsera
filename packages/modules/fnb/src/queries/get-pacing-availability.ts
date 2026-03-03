import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import {
  computePacingAvailability,
  type PacingRule,
  type PacingSlot,
} from '../services/pacing-evaluator';
import type { GetPacingAvailabilityInput } from '../validation-host';

export interface PacingAvailabilityResult {
  date: string;
  mealPeriod: string | undefined;
  slots: PacingSlot[];
}

/**
 * Fetch active pacing rules for the location, compute existing cover counts
 * from confirmed reservations on the given date, then return availability slots.
 */
export async function getPacingAvailability(
  input: GetPacingAvailabilityInput,
): Promise<PacingAvailabilityResult> {
  return withTenant(input.tenantId, async (tx) => {
    // Derive day-of-week from date (JS: 0=Sunday).
    // We parse the date components manually and validate them before constructing
    // a Date object.  JS Date silently rolls over invalid dates (e.g. Feb 30 →
    // Mar 2), which would produce a wrong dayOfWeek without any error signal.
    const parts = input.date.split('-').map(Number);
    const year = parts[0]!;
    const month = parts[1]!;
    const day = parts[2]!;

    if (
      !year || !month || !day ||
      month < 1 || month > 12 ||
      day < 1 || day > 31
    ) {
      throw new Error(`Invalid date: ${input.date}`);
    }

    // Use Date.UTC to avoid local-timezone offset shifting the day boundary.
    const dateObj = new Date(Date.UTC(year, month - 1, day));

    // If JS rolled the date (e.g. Feb 30 → Mar 2), the reconstructed date
    // will not match the input — detect and reject.
    if (
      dateObj.getUTCFullYear() !== year ||
      dateObj.getUTCMonth() + 1 !== month ||
      dateObj.getUTCDate() !== day
    ) {
      throw new Error(`Invalid date: ${input.date}`);
    }

    const dayOfWeek = dateObj.getUTCDay();

    // Load active pacing rules for this location
    const ruleRows = await tx.execute(sql`
      SELECT
        id,
        meal_period,
        day_of_week,
        interval_start_time,
        interval_end_time,
        max_covers,
        max_reservations,
        min_party_size,
        priority,
        is_active
      FROM fnb_pacing_rules
      WHERE tenant_id = ${input.tenantId}
        AND location_id = ${input.locationId}
        AND is_active = true
        ${input.mealPeriod ? sql`AND (meal_period IS NULL OR meal_period = ${input.mealPeriod})` : sql``}
      ORDER BY priority DESC, id ASC
    `);

    const rules: PacingRule[] = Array.from(
      ruleRows as Iterable<Record<string, unknown>>,
    ).map((row) => ({
      id: String(row.id),
      mealPeriod: row.meal_period ? String(row.meal_period) : null,
      dayOfWeek: row.day_of_week !== null ? Number(row.day_of_week) : null,
      intervalStartTime: row.interval_start_time ? String(row.interval_start_time) : null,
      intervalEndTime: row.interval_end_time ? String(row.interval_end_time) : null,
      maxCovers: Number(row.max_covers),
      maxReservations: row.max_reservations !== null ? Number(row.max_reservations) : null,
      minPartySize: row.min_party_size !== null ? Number(row.min_party_size) : null,
      priority: Number(row.priority),
      isActive: Boolean(row.is_active),
    }));

    if (rules.length === 0) {
      return {
        date: input.date,
        mealPeriod: input.mealPeriod,
        slots: [],
      };
    }

    // Load existing confirmed/booked reservation covers for the date
    const coverRows = await tx.execute(sql`
      SELECT
        reservation_time AS time,
        party_size AS covers
      FROM fnb_reservations
      WHERE tenant_id = ${input.tenantId}
        AND location_id = ${input.locationId}
        AND reservation_date = ${input.date}
        AND status NOT IN ('canceled', 'no_show')
        ${input.mealPeriod ? sql`AND (meal_period IS NULL OR meal_period = ${input.mealPeriod})` : sql``}
    `);

    const existingCovers = Array.from(
      coverRows as Iterable<Record<string, unknown>>,
    ).map((row) => ({
      time: String(row.time),
      covers: Number(row.covers),
    }));

    const mealPeriodForCompute = input.mealPeriod ?? '';
    const slots = computePacingAvailability(rules, existingCovers, mealPeriodForCompute, dayOfWeek);

    return {
      date: input.date,
      mealPeriod: input.mealPeriod,
      slots,
    };
  });
}
