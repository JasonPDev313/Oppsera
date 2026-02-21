import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface RatePlanPriceRow {
  id: string;
  ratePlanId: string;
  roomTypeId: string;
  roomTypeCode: string;
  roomTypeName: string;
  startDate: string;
  endDate: string;
  nightlyBaseCents: number;
  createdAt: string;
  updatedAt: string;
}

interface GetRatePlanPricesInput {
  tenantId: string;
  ratePlanId: string;
  roomTypeId?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Lists all price rows for a rate plan, optionally filtered by room type
 * and/or date range overlap.
 *
 * Date range filter: returns rows whose [startDate, endDate) range
 * overlaps with the provided [startDate, endDate) range.
 */
export async function getRatePlanPrices(
  input: GetRatePlanPricesInput,
): Promise<RatePlanPriceRow[]> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      sql`p.tenant_id = ${input.tenantId}`,
      sql`p.rate_plan_id = ${input.ratePlanId}`,
    ];

    if (input.roomTypeId) {
      conditions.push(sql`p.room_type_id = ${input.roomTypeId}`);
    }

    // Overlap check: price range [p.start_date, p.end_date) overlaps [startDate, endDate)
    // when p.start_date < endDate AND p.end_date > startDate
    if (input.startDate) {
      conditions.push(sql`p.end_date > ${input.startDate}`);
    }
    if (input.endDate) {
      conditions.push(sql`p.start_date < ${input.endDate}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(sql`
      SELECT
        p.id,
        p.rate_plan_id,
        p.room_type_id,
        rt.code AS room_type_code,
        rt.name AS room_type_name,
        p.start_date,
        p.end_date,
        p.nightly_base_cents,
        p.created_at,
        p.updated_at
      FROM pms_rate_plan_prices p
      INNER JOIN pms_room_types rt ON rt.id = p.room_type_id AND rt.tenant_id = p.tenant_id
      WHERE ${whereClause}
      ORDER BY rt.sort_order ASC, p.start_date ASC
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);

    return arr.map((r) => ({
      id: String(r.id),
      ratePlanId: String(r.rate_plan_id),
      roomTypeId: String(r.room_type_id),
      roomTypeCode: String(r.room_type_code),
      roomTypeName: String(r.room_type_name),
      startDate: String(r.start_date),
      endDate: String(r.end_date),
      nightlyBaseCents: Number(r.nightly_base_cents),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  });
}
