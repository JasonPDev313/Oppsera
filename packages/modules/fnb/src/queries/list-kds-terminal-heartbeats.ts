import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface KdsTerminalStatus {
  terminalId: string;
  stationId: string;
  stationName: string | null;
  userId: string | null;
  ipAddress: string | null;
  lastSeenAt: string;
  isOnline: boolean;
  offlineSeconds: number;
}

/**
 * Lists all KDS terminal heartbeats for a location.
 * Terminals not seen in the last 120 seconds are considered offline.
 */
export async function listKdsTerminalHeartbeats(
  tenantId: string,
  locationId: string,
): Promise<KdsTerminalStatus[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT h.terminal_id, h.station_id, h.user_id, h.ip_address, h.last_seen_at,
             ks.display_name AS station_name,
             EXTRACT(EPOCH FROM (NOW() - h.last_seen_at))::integer AS offline_seconds
      FROM fnb_kds_terminal_heartbeats h
      LEFT JOIN fnb_kitchen_stations ks ON ks.id = h.station_id
      WHERE h.tenant_id = ${tenantId}
        AND h.location_id = ${locationId}
      ORDER BY h.station_id, h.terminal_id
    `);

    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => {
      const offlineSeconds = Number(r.offline_seconds ?? 0);
      return {
        terminalId: r.terminal_id as string,
        stationId: r.station_id as string,
        stationName: (r.station_name as string) ?? null,
        userId: (r.user_id as string) ?? null,
        ipAddress: (r.ip_address as string) ?? null,
        lastSeenAt: r.last_seen_at as string,
        isOnline: offlineSeconds < 120,
        offlineSeconds,
      };
    });
  });
}
