import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { ListStationsFilterInput } from '../validation';

export interface StationListItem {
  id: string;
  name: string;
  displayName: string;
  stationType: string;
  color: string | null;
  sortOrder: number;
  fallbackStationId: string | null;
  backupPrinterId: string | null;
  warningThresholdSeconds: number;
  criticalThresholdSeconds: number;
  isActive: boolean;
}

export async function listStations(
  input: ListStationsFilterInput,
): Promise<StationListItem[]> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`tenant_id = ${input.tenantId}`,
      sql`location_id = ${input.locationId}`,
    ];

    if (input.stationType) {
      conditions.push(sql`station_type = ${input.stationType}`);
    }
    if (input.isActive !== undefined) {
      conditions.push(sql`is_active = ${input.isActive}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(
      sql`SELECT id, name, display_name, station_type, color, sort_order,
                 fallback_station_id, backup_printer_id,
                 warning_threshold_seconds, critical_threshold_seconds, is_active
          FROM fnb_kitchen_stations
          WHERE ${whereClause}
          ORDER BY sort_order ASC, name ASC`,
    );

    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      displayName: r.display_name as string,
      stationType: r.station_type as string,
      color: (r.color as string) ?? null,
      sortOrder: Number(r.sort_order),
      fallbackStationId: (r.fallback_station_id as string) ?? null,
      backupPrinterId: (r.backup_printer_id as string) ?? null,
      warningThresholdSeconds: Number(r.warning_threshold_seconds),
      criticalThresholdSeconds: Number(r.critical_threshold_seconds),
      isActive: r.is_active as boolean,
    }));
  });
}
