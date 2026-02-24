/**
 * Check if a reservation violates any active rate restrictions.
 * Returns { allowed: boolean, violations: string[] }
 *
 * Checks:
 * 1. Stop-sell on any date in the stay
 * 2. CTA (closed to arrival) on check-in date
 * 3. CTD (closed to departure) on check-out date
 * 4. Min-stay / max-stay violations
 *
 * Restrictions are matched in priority order:
 * - Room type + rate plan specific
 * - Room type specific (any plan)
 * - Property-wide (any room type)
 */
import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface CheckRestrictionsInput {
  tenantId: string;
  propertyId: string;
  roomTypeId: string;
  ratePlanId?: string | null;
  checkInDate: string;
  checkOutDate: string;
}

export interface CheckRestrictionsResult {
  allowed: boolean;
  violations: string[];
}

export async function checkRestrictions(
  input: CheckRestrictionsInput,
): Promise<CheckRestrictionsResult> {
  return withTenant(input.tenantId, async (tx) => {
    const violations: string[] = [];

    // Calculate nights
    const checkIn = new Date(input.checkInDate);
    const checkOut = new Date(input.checkOutDate);
    const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

    // Fetch all relevant restrictions for the stay dates
    // Match: exact (roomType + ratePlan), roomType-only, or property-wide
    const rows = await tx.execute(sql`
      SELECT
        restriction_date,
        room_type_id,
        rate_plan_id,
        min_stay,
        max_stay,
        cta,
        ctd,
        stop_sell
      FROM pms_rate_restrictions
      WHERE tenant_id = ${input.tenantId}
        AND property_id = ${input.propertyId}
        AND restriction_date >= ${input.checkInDate}
        AND restriction_date < ${input.checkOutDate}
        AND (
          room_type_id IS NULL
          OR room_type_id = ${input.roomTypeId}
        )
        AND (
          rate_plan_id IS NULL
          ${input.ratePlanId ? sql`OR rate_plan_id = ${input.ratePlanId}` : sql``}
        )
      ORDER BY restriction_date, room_type_id NULLS LAST, rate_plan_id NULLS LAST
    `);

    const restrictions = Array.from(rows as Iterable<Record<string, unknown>>);

    // Group by date — most specific restriction wins
    const byDate = new Map<string, Record<string, unknown>>();
    for (const r of restrictions) {
      const d = String(r.restriction_date);
      const existing = byDate.get(d);
      if (!existing) {
        byDate.set(d, r);
        continue;
      }
      // More specific (has roomTypeId AND ratePlanId) takes priority
      const existingSpecificity =
        (existing.room_type_id ? 2 : 0) + (existing.rate_plan_id ? 1 : 0);
      const newSpecificity =
        (r.room_type_id ? 2 : 0) + (r.rate_plan_id ? 1 : 0);
      if (newSpecificity > existingSpecificity) {
        byDate.set(d, r);
      }
    }

    // Check each date's restriction
    for (const [dateStr, r] of byDate) {
      // Stop-sell
      if (r.stop_sell === true) {
        violations.push(`Stop-sell on ${dateStr}`);
      }

      // CTA — only applies to check-in date
      if (r.cta === true && dateStr === input.checkInDate) {
        violations.push(`Closed to arrival on ${dateStr}`);
      }

      // CTD — applies to the day before check-out (departure date in restriction terms)
      // Actually CTD means no departures on that date, so check if checkOutDate matches
      // But restrictions are for dates < checkOutDate. CTD on the last night means
      // the guest cannot depart the next day.
      // Convention: CTD on date X means no departure on date X+1.
      // We check: if any night's date has CTD and checkOutDate = date + 1 day
      if (r.ctd === true) {
        const restrictionDate = new Date(dateStr);
        const nextDay = new Date(restrictionDate);
        nextDay.setDate(nextDay.getDate() + 1);
        const nextDayStr = nextDay.toISOString().split('T')[0]!;
        if (nextDayStr === input.checkOutDate) {
          violations.push(`Closed to departure on ${input.checkOutDate}`);
        }
      }

      // Min-stay
      if (r.min_stay != null && nights < Number(r.min_stay)) {
        violations.push(
          `Minimum stay of ${r.min_stay} nights required (booking is ${nights} nights) — restriction on ${dateStr}`,
        );
      }

      // Max-stay
      if (r.max_stay != null && nights > Number(r.max_stay)) {
        violations.push(
          `Maximum stay of ${r.max_stay} nights exceeded (booking is ${nights} nights) — restriction on ${dateStr}`,
        );
      }
    }

    // Deduplicate violations
    const unique = [...new Set(violations)];

    return {
      allowed: unique.length === 0,
      violations: unique,
    };
  });
}
