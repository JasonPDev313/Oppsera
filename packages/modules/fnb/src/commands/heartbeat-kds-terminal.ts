import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { logger } from '@oppsera/core/observability';
import type { HeartbeatKdsTerminalInput } from '../validation';

export interface HeartbeatKdsTerminalResult {
  terminalId: string;
  stationId: string;
  lastSeenAt: string;
}

/**
 * Upserts a KDS terminal heartbeat.
 * Called periodically by KDS display terminals to indicate they're online.
 */
export async function heartbeatKdsTerminal(
  tenantId: string,
  locationId: string,
  input: HeartbeatKdsTerminalInput,
): Promise<HeartbeatKdsTerminalResult> {
  const result = await withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      INSERT INTO fnb_kds_terminal_heartbeats (
        id, tenant_id, location_id, terminal_id, station_id,
        user_id, ip_address, user_agent, last_seen_at,
        created_at, updated_at
      ) VALUES (
        gen_ulid(), ${tenantId}, ${locationId}, ${input.terminalId}, ${input.stationId},
        ${input.userId ?? null}, ${input.ipAddress ?? null}, ${input.userAgent ?? null}, NOW(),
        NOW(), NOW()
      )
      ON CONFLICT (tenant_id, location_id, terminal_id)
      DO UPDATE SET
        station_id = ${input.stationId},
        user_id = COALESCE(${input.userId ?? null}, fnb_kds_terminal_heartbeats.user_id),
        ip_address = COALESCE(${input.ipAddress ?? null}, fnb_kds_terminal_heartbeats.ip_address),
        user_agent = COALESCE(${input.userAgent ?? null}, fnb_kds_terminal_heartbeats.user_agent),
        last_seen_at = NOW(),
        updated_at = NOW()
      RETURNING terminal_id, station_id, last_seen_at
    `);

    const row = Array.from(rows as Iterable<Record<string, unknown>>)[0];
    return {
      terminalId: row!.terminal_id as string,
      stationId: row!.station_id as string,
      lastSeenAt: row!.last_seen_at as string,
    };
  });

  logger.debug('[kds] terminal heartbeat', {
    domain: 'kds', tenantId, locationId,
    terminalId: input.terminalId, stationId: input.stationId,
  });

  return result;
}
