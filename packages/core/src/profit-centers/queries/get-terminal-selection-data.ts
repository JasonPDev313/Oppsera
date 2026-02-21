import { withTenant, sql } from '@oppsera/db';

export async function getLocationsForSelection(tenantId: string) {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT id, name, location_type, parent_location_id
      FROM locations
      WHERE tenant_id = ${tenantId} AND is_active = true
      ORDER BY location_type, name
    `);
    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      name: String(r.name),
      locationType: String(r.location_type) as 'site' | 'venue',
      parentLocationId: r.parent_location_id ? String(r.parent_location_id) : null,
    }));
  });
}

export async function getProfitCentersForSelection(tenantId: string, locationId: string) {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT id, title AS name, code, icon
      FROM terminal_locations
      WHERE tenant_id = ${tenantId}
        AND location_id = ${locationId}
        AND is_active = true
      ORDER BY sort_order, title
    `);
    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      name: String(r.name),
      code: r.code ? String(r.code) : null,
      icon: r.icon ? String(r.icon) : null,
    }));
  });
}

export async function getTerminalsForSelection(tenantId: string, profitCenterId: string) {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT id, title AS name, terminal_number, device_identifier FROM terminals
      WHERE tenant_id = ${tenantId}
        AND terminal_location_id = ${profitCenterId}
        AND is_active = true
      ORDER BY terminal_number NULLS LAST, title
    `);
    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      name: String(r.name),
      terminalNumber: r.terminal_number != null ? Number(r.terminal_number) : null,
      deviceIdentifier: r.device_identifier ? String(r.device_identifier) : null,
    }));
  });
}
