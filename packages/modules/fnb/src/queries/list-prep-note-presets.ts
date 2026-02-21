import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { ListPrepNotePresetsInput } from '../validation';

export interface PrepNotePresetItem {
  id: string;
  catalogItemId: string | null;
  noteText: string;
  sortOrder: number;
  isActive: boolean;
}

export async function listPrepNotePresets(
  input: ListPrepNotePresetsInput,
): Promise<PrepNotePresetItem[]> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`tenant_id = ${input.tenantId}`,
      sql`is_active = true`,
    ];

    if (input.locationId) {
      // Get location-specific + global (null locationId)
      conditions.push(sql`(location_id = ${input.locationId} OR location_id IS NULL)`);
    }
    if (input.catalogItemId) {
      // Get item-specific + global (null catalogItemId)
      conditions.push(sql`(catalog_item_id = ${input.catalogItemId} OR catalog_item_id IS NULL)`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(
      sql`SELECT id, catalog_item_id, note_text, sort_order, is_active
          FROM fnb_prep_note_presets
          WHERE ${whereClause}
          ORDER BY sort_order ASC, note_text ASC`,
    );

    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      catalogItemId: (r.catalog_item_id as string) ?? null,
      noteText: r.note_text as string,
      sortOrder: Number(r.sort_order),
      isActive: r.is_active as boolean,
    }));
  });
}
