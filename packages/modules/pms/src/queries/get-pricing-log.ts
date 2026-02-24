import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface PricingLogEntry {
  id: string;
  propertyId: string;
  roomTypeId: string;
  businessDate: string;
  baseRateCents: number;
  adjustedRateCents: number;
  rulesAppliedJson: Array<{ ruleId: string; ruleName: string; adjustment: number }>;
  createdAt: string;
}

export interface GetPricingLogInput {
  propertyId: string;
  startDate: string;
  endDate: string;
  roomTypeId?: string;
}

export async function getPricingLog(
  tenantId: string,
  input: GetPricingLogInput,
): Promise<PricingLogEntry[]> {
  return withTenant(tenantId, async (tx) => {
    const conditions = [
      sql`tenant_id = ${tenantId}`,
      sql`property_id = ${input.propertyId}`,
      sql`business_date >= ${input.startDate}`,
      sql`business_date <= ${input.endDate}`,
    ];

    if (input.roomTypeId) {
      conditions.push(sql`room_type_id = ${input.roomTypeId}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(sql`
      SELECT id, property_id, room_type_id, business_date,
        base_rate_cents, adjusted_rate_cents, rules_applied_json, created_at
      FROM pms_pricing_log
      WHERE ${whereClause}
      ORDER BY business_date ASC, room_type_id ASC
    `);

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);

    return arr.map((r) => ({
      id: String(r.id),
      propertyId: String(r.property_id),
      roomTypeId: String(r.room_type_id),
      businessDate: String(r.business_date),
      baseRateCents: Number(r.base_rate_cents),
      adjustedRateCents: Number(r.adjusted_rate_cents),
      rulesAppliedJson: (r.rules_applied_json ?? []) as PricingLogEntry['rulesAppliedJson'],
      createdAt: String(r.created_at),
    }));
  });
}
