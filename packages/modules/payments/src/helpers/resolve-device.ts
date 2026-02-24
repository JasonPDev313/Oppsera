/**
 * Device resolution — find the physical payment device assigned to a POS terminal.
 *
 * Used by card-present payment commands to determine which HSN to send
 * terminal API requests to.
 */

import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface ResolvedDevice {
  id: string;
  hsn: string;
  deviceModel: string | null;
  deviceLabel: string | null;
  providerId: string;
}

/**
 * Look up the active device assignment for a given POS terminal.
 * Returns null if no device is assigned (card-not-present only).
 */
export async function resolveDevice(
  tenantId: string,
  terminalId: string,
): Promise<ResolvedDevice | null> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute<{
      id: string;
      hsn: string;
      device_model: string | null;
      device_label: string | null;
      provider_id: string;
    }>(sql`
      SELECT id, hsn, device_model, device_label, provider_id
      FROM terminal_device_assignments
      WHERE tenant_id = ${tenantId}
        AND terminal_id = ${terminalId}
        AND is_active = true
      LIMIT 1
    `);

    const result = Array.from(rows as Iterable<{
      id: string;
      hsn: string;
      device_model: string | null;
      device_label: string | null;
      provider_id: string;
    }>);

    if (result.length === 0) return null;

    const row = result[0]!;
    return {
      id: row.id,
      hsn: row.hsn,
      deviceModel: row.device_model,
      deviceLabel: row.device_label,
      providerId: row.provider_id,
    };
  });
}
