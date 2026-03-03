/**
 * List active cleaning types for a property.
 */
import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface CleaningTypeItem {
  id: string;
  propertyId: string;
  code: string;
  name: string;
  description: string | null;
  estimatedMinutes: number | null;
  sortOrder: number;
  isActive: boolean;
}

export async function listCleaningTypes(
  tenantId: string,
  propertyId: string,
  includeInactive = false,
): Promise<CleaningTypeItem[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT id, property_id, code, name, description, estimated_minutes, sort_order, is_active
      FROM pms_cleaning_types
      WHERE tenant_id = ${tenantId}
        AND property_id = ${propertyId}
        ${includeInactive ? sql`` : sql`AND is_active = true`}
      ORDER BY sort_order ASC, name ASC
    `);

    return Array.from(rows as Iterable<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      propertyId: String(row.property_id),
      code: String(row.code),
      name: String(row.name),
      description: row.description ? String(row.description) : null,
      estimatedMinutes: row.estimated_minutes != null ? Number(row.estimated_minutes) : null,
      sortOrder: Number(row.sort_order),
      isActive: Boolean(row.is_active),
    }));
  });
}
