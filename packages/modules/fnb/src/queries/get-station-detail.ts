import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GetStationDetailInput } from '../validation';
import { StationNotFoundError } from '../errors';

export interface DisplayConfig {
  id: string;
  displayDeviceId: string | null;
  displayMode: string;
  columnsPerRow: number;
  sortBy: string;
  showModifiers: boolean;
  showSeatNumbers: boolean;
  showCourseHeaders: boolean;
  autoScrollEnabled: boolean;
  soundAlertEnabled: boolean;
}

export interface StationDetail {
  id: string;
  name: string;
  displayName: string;
  stationType: string;
  color: string | null;
  sortOrder: number;
  fallbackStationId: string | null;
  fallbackStationName: string | null;
  backupPrinterId: string | null;
  terminalLocationId: string | null;
  warningThresholdSeconds: number;
  criticalThresholdSeconds: number;
  isActive: boolean;
  displayConfigs: DisplayConfig[];
}

export async function getStationDetail(
  input: GetStationDetailInput,
): Promise<StationDetail> {
  return withTenant(input.tenantId, async (tx) => {
    const stationRows = await tx.execute(
      sql`SELECT s.id, s.name, s.display_name, s.station_type, s.color,
                 s.sort_order, s.fallback_station_id, s.backup_printer_id,
                 s.terminal_location_id, s.warning_threshold_seconds,
                 s.critical_threshold_seconds, s.is_active,
                 fb.name AS fallback_station_name
          FROM fnb_kitchen_stations s
          LEFT JOIN fnb_kitchen_stations fb ON fb.id = s.fallback_station_id
          WHERE s.id = ${input.stationId} AND s.tenant_id = ${input.tenantId}
          LIMIT 1`,
    );

    const stationArr = Array.from(stationRows as Iterable<Record<string, unknown>>);
    if (stationArr.length === 0) throw new StationNotFoundError(input.stationId);
    const s = stationArr[0]!;

    // Get display configs
    const configRows = await tx.execute(
      sql`SELECT id, display_device_id, display_mode, columns_per_row, sort_by,
                 show_modifiers, show_seat_numbers, show_course_headers,
                 auto_scroll_enabled, sound_alert_enabled
          FROM fnb_station_display_configs
          WHERE station_id = ${input.stationId} AND tenant_id = ${input.tenantId}`,
    );
    const displayConfigs = Array.from(configRows as Iterable<Record<string, unknown>>).map((c) => ({
      id: c.id as string,
      displayDeviceId: (c.display_device_id as string) ?? null,
      displayMode: c.display_mode as string,
      columnsPerRow: Number(c.columns_per_row),
      sortBy: c.sort_by as string,
      showModifiers: c.show_modifiers as boolean,
      showSeatNumbers: c.show_seat_numbers as boolean,
      showCourseHeaders: c.show_course_headers as boolean,
      autoScrollEnabled: c.auto_scroll_enabled as boolean,
      soundAlertEnabled: c.sound_alert_enabled as boolean,
    }));

    return {
      id: s.id as string,
      name: s.name as string,
      displayName: s.display_name as string,
      stationType: s.station_type as string,
      color: (s.color as string) ?? null,
      sortOrder: Number(s.sort_order),
      fallbackStationId: (s.fallback_station_id as string) ?? null,
      fallbackStationName: (s.fallback_station_name as string) ?? null,
      backupPrinterId: (s.backup_printer_id as string) ?? null,
      terminalLocationId: (s.terminal_location_id as string) ?? null,
      warningThresholdSeconds: Number(s.warning_threshold_seconds),
      criticalThresholdSeconds: Number(s.critical_threshold_seconds),
      isActive: s.is_active as boolean,
      displayConfigs,
    };
  });
}
