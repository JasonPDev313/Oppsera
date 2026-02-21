import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface NightlyRateResult {
  priceId: string | null;
  ratePlanId: string;
  roomTypeId: string;
  startDate: string | null;
  endDate: string | null;
  nightlyBaseCents: number;
  source: 'price_table' | 'rate_plan_default';
}

/**
 * Resolves the applicable nightly rate for a given rate plan, room type, and date.
 *
 * Resolution order:
 * 1. Date-specific price from pms_rate_plan_prices (startDate <= date < endDate, latest createdAt)
 * 2. Fallback to rate plan's defaultNightlyRateCents
 *
 * Returns null if neither exists.
 */
export async function getNightlyRate(
  tenantId: string,
  ratePlanId: string,
  roomTypeId: string,
  date: string,
): Promise<NightlyRateResult | null> {
  return withTenant(tenantId, async (tx) => {
    // 1. Try date-specific price
    const rows = await tx.execute(sql`
      SELECT
        id,
        rate_plan_id,
        room_type_id,
        start_date,
        end_date,
        nightly_base_cents
      FROM pms_rate_plan_prices
      WHERE tenant_id = ${tenantId}
        AND rate_plan_id = ${ratePlanId}
        AND room_type_id = ${roomTypeId}
        AND start_date <= ${date}
        AND end_date > ${date}
      ORDER BY created_at DESC
      LIMIT 1
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    if (arr.length > 0) {
      const row = arr[0]!;
      return {
        priceId: String(row.id),
        ratePlanId: String(row.rate_plan_id),
        roomTypeId: String(row.room_type_id),
        startDate: String(row.start_date),
        endDate: String(row.end_date),
        nightlyBaseCents: Number(row.nightly_base_cents),
        source: 'price_table' as const,
      };
    }

    // 2. Fallback to rate plan's default rate
    const planRows = await tx.execute(sql`
      SELECT default_nightly_rate_cents
      FROM pms_rate_plans
      WHERE tenant_id = ${tenantId}
        AND id = ${ratePlanId}
      LIMIT 1
    `);

    const planArr = Array.from(planRows as Iterable<Record<string, unknown>>);
    if (planArr.length > 0 && planArr[0]!.default_nightly_rate_cents != null) {
      return {
        priceId: null,
        ratePlanId,
        roomTypeId,
        startDate: null,
        endDate: null,
        nightlyBaseCents: Number(planArr[0]!.default_nightly_rate_cents),
        source: 'rate_plan_default' as const,
      };
    }

    return null;
  });
}
