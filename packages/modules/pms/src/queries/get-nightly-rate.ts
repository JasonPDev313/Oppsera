import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface NightlyRateResult {
  priceId: string;
  ratePlanId: string;
  roomTypeId: string;
  startDate: string;
  endDate: string;
  nightlyBaseCents: number;
}

/**
 * Resolves the applicable nightly rate for a given rate plan, room type, and date.
 *
 * Resolution: finds rows where startDate <= date < endDate, picks the one
 * with the latest createdAt (most recently created price wins).
 *
 * Returns null if no matching price row exists.
 */
export async function getNightlyRate(
  tenantId: string,
  ratePlanId: string,
  roomTypeId: string,
  date: string,
): Promise<NightlyRateResult | null> {
  return withTenant(tenantId, async (tx) => {
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
    if (arr.length === 0) {
      return null;
    }

    const row = arr[0]!;
    return {
      priceId: String(row.id),
      ratePlanId: String(row.rate_plan_id),
      roomTypeId: String(row.room_type_id),
      startDate: String(row.start_date),
      endDate: String(row.end_date),
      nightlyBaseCents: Number(row.nightly_base_cents),
    };
  });
}
