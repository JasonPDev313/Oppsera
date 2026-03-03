import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface PacingRuleListItem {
  id: string;
  tenantId: string;
  locationId: string;
  mealPeriod: string | null;
  dayOfWeek: number | null;
  intervalStartTime: string | null;
  intervalEndTime: string | null;
  maxCovers: number;
  maxReservations: number | null;
  minPartySize: number | null;
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

export interface ListPacingRulesInput {
  tenantId: string;
  locationId: string;
  isActive?: boolean;
}

export async function listPacingRules(
  input: ListPacingRulesInput,
): Promise<PacingRuleListItem[]> {
  return withTenant(input.tenantId, async (tx) => {
    const activeFilter =
      input.isActive !== undefined
        ? sql`AND is_active = ${input.isActive}`
        : sql``;

    const rows = await tx.execute(sql`
      SELECT
        id,
        tenant_id,
        location_id,
        meal_period,
        day_of_week,
        interval_start_time,
        interval_end_time,
        max_covers,
        max_reservations,
        min_party_size,
        priority,
        is_active,
        created_at,
        updated_at,
        created_by
      FROM fnb_pacing_rules
      WHERE tenant_id = ${input.tenantId}
        AND location_id = ${input.locationId}
        ${activeFilter}
      ORDER BY priority DESC, interval_start_time ASC NULLS LAST, id ASC
    `);

    return Array.from(rows as Iterable<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      tenantId: String(row.tenant_id),
      locationId: String(row.location_id),
      mealPeriod: row.meal_period ? String(row.meal_period) : null,
      dayOfWeek: row.day_of_week !== null ? Number(row.day_of_week) : null,
      intervalStartTime: row.interval_start_time ? String(row.interval_start_time) : null,
      intervalEndTime: row.interval_end_time ? String(row.interval_end_time) : null,
      maxCovers: Number(row.max_covers),
      maxReservations: row.max_reservations !== null ? Number(row.max_reservations) : null,
      minPartySize: row.min_party_size !== null ? Number(row.min_party_size) : null,
      priority: Number(row.priority),
      isActive: Boolean(row.is_active),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      createdBy: row.created_by ? String(row.created_by) : null,
    }));
  });
}
