import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { ListEightySixedInput } from '../validation';

export interface EightySixedItem {
  id: string;
  entityType: string;
  entityId: string;
  stationId: string | null;
  reason: string | null;
  eightySixedAt: string;
  eightySixedBy: string;
  restoredAt: string | null;
  autoRestoreAtDayEnd: boolean;
  businessDate: string;
}

export async function listEightySixed(
  input: ListEightySixedInput,
): Promise<EightySixedItem[]> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`tenant_id = ${input.tenantId}`,
      sql`location_id = ${input.locationId}`,
      sql`business_date = ${input.businessDate}`,
    ];

    if (input.entityType) {
      conditions.push(sql`entity_type = ${input.entityType}`);
    }
    if (input.activeOnly) {
      conditions.push(sql`restored_at IS NULL`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(
      sql`SELECT id, entity_type, entity_id, station_id, reason,
                 eighty_sixed_at, eighty_sixed_by, restored_at,
                 auto_restore_at_day_end, business_date
          FROM fnb_eighty_six_log
          WHERE ${whereClause}
          ORDER BY eighty_sixed_at DESC`,
    );

    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      entityType: r.entity_type as string,
      entityId: r.entity_id as string,
      stationId: (r.station_id as string) ?? null,
      reason: (r.reason as string) ?? null,
      eightySixedAt: r.eighty_sixed_at as string,
      eightySixedBy: r.eighty_sixed_by as string,
      restoredAt: (r.restored_at as string) ?? null,
      autoRestoreAtDayEnd: r.auto_restore_at_day_end as boolean,
      businessDate: r.business_date as string,
    }));
  });
}
