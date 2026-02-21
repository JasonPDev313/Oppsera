import { withTenant, sql } from '@oppsera/db';
import type { Terminal } from '../types';

interface GetTerminalInput {
  tenantId: string;
  id: string;
}

export async function getTerminal(
  input: GetTerminalInput,
): Promise<Terminal | null> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT
        t.id,
        t.tenant_id,
        t.terminal_location_id AS profit_center_id,
        tl.title AS profit_center_name,
        t.location_id,
        t.title AS name,
        t.terminal_number,
        t.device_identifier,
        t.ip_address,
        t.is_active,
        t.created_at,
        t.updated_at
      FROM terminals t
      JOIN terminal_locations tl ON tl.id = t.terminal_location_id
      WHERE t.tenant_id = ${input.tenantId}
        AND t.id = ${input.id}
    `);

    const items = Array.from(rows as Iterable<Record<string, unknown>>);
    if (items.length === 0) return null;

    const row = items[0]!;
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      profitCenterId: String(row.profit_center_id),
      profitCenterName: String(row.profit_center_name),
      locationId: row.location_id ? String(row.location_id) : null,
      name: String(row.name),
      terminalNumber: row.terminal_number != null ? Number(row.terminal_number) : null,
      deviceIdentifier: row.device_identifier ? String(row.device_identifier) : null,
      ipAddress: row.ip_address ? String(row.ip_address) : null,
      isActive: Boolean(row.is_active),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  });
}
