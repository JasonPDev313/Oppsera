import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { calculateRevPASH } from '../services/revpash-calculator';
import type { RevPASHResult } from '../services/revpash-calculator';

export type { RevPASHResult };

export interface GetRevpashMetricsInput {
  tenantId: string;
  locationId: string;
  date: string;          // YYYY-MM-DD
  mealPeriod?: string;   // 'breakfast' | 'lunch' | 'dinner' | undefined
}

/**
 * Hours by meal period for RevPASH denominator.
 * Default (full day) = 12 hours.
 */
function mealPeriodHours(mealPeriod?: string): number {
  switch (mealPeriod) {
    case 'breakfast': return 3;
    case 'lunch':     return 4;
    case 'dinner':    return 5;
    default:          return 12;
  }
}

/**
 * Fetch total revenue for the date from rm_fnb_table_turns,
 * seat count from fnb_tables, then calculate RevPASH.
 */
export async function getRevpashMetrics(
  input: GetRevpashMetricsInput,
): Promise<RevPASHResult> {
  const { tenantId, locationId, date, mealPeriod } = input;
  const hoursInPeriod = mealPeriodHours(mealPeriod);

  return withTenant(tenantId, async (tx) => {
    // 1. Sum revenue from table turns for the business date.
    //    When a mealPeriod filter is provided, scope revenue to that period only.
    const [revenueRows, seatRows] = await Promise.all([
      tx.execute(
        mealPeriod
          ? sql`
              SELECT COALESCE(SUM(total_revenue_cents), 0)::bigint AS total_revenue_cents
              FROM rm_fnb_table_turns
              WHERE tenant_id  = ${tenantId}
                AND location_id = ${locationId}
                AND business_date = ${date}
                AND meal_period = ${mealPeriod}
            `
          : sql`
              SELECT COALESCE(SUM(total_revenue_cents), 0)::bigint AS total_revenue_cents
              FROM rm_fnb_table_turns
              WHERE tenant_id  = ${tenantId}
                AND location_id = ${locationId}
                AND business_date = ${date}
            `,
      ),

      // 2. Count total seats from active tables
      tx.execute(sql`
        SELECT COALESCE(SUM(capacity_max), 0)::int AS total_seats
        FROM fnb_tables
        WHERE tenant_id = ${tenantId}
          AND location_id = ${locationId}
          AND is_active = true
      `),
    ]);

    const revenueRow = Array.from(revenueRows as Iterable<Record<string, unknown>>)[0] ?? {};
    const seatRow = Array.from(seatRows as Iterable<Record<string, unknown>>)[0] ?? {};

    const totalRevenueCents = Number(revenueRow.total_revenue_cents ?? 0);
    const availableSeats = Number(seatRow.total_seats ?? 0);

    return calculateRevPASH(totalRevenueCents, availableSeats, hoursInPeriod);
  });
}
