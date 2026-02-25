import { withTenant, sql } from '@oppsera/db';
import type { ProfitCenter, Terminal } from '../types';

interface LocationForSettings {
  id: string;
  name: string;
  locationType: 'site' | 'venue';
  parentLocationId: string | null;
}

interface SettingsData {
  locations: LocationForSettings[];
  profitCenters: ProfitCenter[];
  terminals: Terminal[];
}

/**
 * Single query that fetches all locations, profit centers, and terminals
 * for the settings page. Replaces 3 separate API calls with 1.
 */
export async function getSettingsData(tenantId: string): Promise<SettingsData> {
  return withTenant(tenantId, async (tx) => {
    // Run all 3 queries in parallel inside the same withTenant connection
    const [locationRows, pcRows, terminalRows] = await Promise.all([
      tx.execute(sql`
        SELECT id, name, location_type, parent_location_id
        FROM locations
        WHERE tenant_id = ${tenantId} AND is_active = true
        ORDER BY location_type, name
      `),
      tx.execute(sql`
        SELECT
          tl.id,
          tl.tenant_id,
          tl.location_id,
          l.name AS location_name,
          tl.title AS name,
          tl.code,
          tl.description,
          tl.icon,
          tl.is_active,
          tl.tips_applicable,
          tl.sort_order,
          COUNT(t.id) FILTER (WHERE t.is_active = true) AS terminal_count,
          tl.created_at,
          tl.updated_at
        FROM terminal_locations tl
        LEFT JOIN locations l ON l.id = tl.location_id
        LEFT JOIN terminals t ON t.terminal_location_id = tl.id
        WHERE tl.tenant_id = ${tenantId} AND tl.is_active = true
        GROUP BY tl.id, l.name
        ORDER BY tl.sort_order, tl.title
      `),
      tx.execute(sql`
        SELECT
          t.id,
          t.tenant_id,
          t.terminal_location_id AS profit_center_id,
          tl.title AS profit_center_name,
          tl.location_id,
          t.title AS name,
          t.terminal_number,
          t.device_identifier,
          t.ip_address,
          t.is_active,
          t.created_at,
          t.updated_at
        FROM terminals t
        JOIN terminal_locations tl ON tl.id = t.terminal_location_id
        WHERE t.tenant_id = ${tenantId} AND t.is_active = true
        ORDER BY t.terminal_number NULLS LAST, t.title
      `),
    ]);

    const locations = Array.from(locationRows as Iterable<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      name: String(r.name),
      locationType: (r.location_type ? String(r.location_type) as 'site' | 'venue' : 'site') as 'site' | 'venue',
      parentLocationId: r.parent_location_id ? String(r.parent_location_id) : null,
    }));

    const profitCenters = Array.from(pcRows as Iterable<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      tenantId: String(row.tenant_id),
      locationId: String(row.location_id),
      locationName: row.location_name ? String(row.location_name) : null,
      name: String(row.name),
      code: row.code ? String(row.code) : null,
      description: row.description ? String(row.description) : null,
      icon: row.icon ? String(row.icon) : null,
      isActive: Boolean(row.is_active),
      tipsApplicable: Boolean(row.tips_applicable),
      sortOrder: Number(row.sort_order),
      terminalCount: Number(row.terminal_count),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }));

    const terminals = Array.from(terminalRows as Iterable<Record<string, unknown>>).map((row) => ({
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
    }));

    return { locations, profitCenters, terminals };
  });
}
