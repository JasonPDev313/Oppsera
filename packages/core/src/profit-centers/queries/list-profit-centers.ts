import { withTenant, sql } from '@oppsera/db';
import type { ProfitCenter } from '../types';

interface ListProfitCentersInput {
  tenantId: string;
  locationId?: string;
  includeInactive?: boolean;
}

export async function listProfitCenters(
  input: ListProfitCentersInput,
): Promise<{ items: ProfitCenter[] }> {
  return withTenant(input.tenantId, async (tx) => {
    const locationFilter = input.locationId
      ? sql`AND tl.location_id = ${input.locationId}`
      : sql``;

    const activeFilter = input.includeInactive
      ? sql``
      : sql`AND tl.is_active = true`;

    const rows = await tx.execute(sql`
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
      WHERE tl.tenant_id = ${input.tenantId}
        ${locationFilter}
        ${activeFilter}
      GROUP BY tl.id, l.name
      ORDER BY tl.sort_order, tl.title
    `);

    const items = Array.from(rows as Iterable<Record<string, unknown>>).map((row) => ({
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

    return { items };
  });
}
