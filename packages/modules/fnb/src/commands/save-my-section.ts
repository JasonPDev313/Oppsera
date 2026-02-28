import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { SaveMySectionInput } from '../validation';

interface ConflictDetail {
  tableId: string;
  claimedByUserId: string;
  claimedByName: string | null;
}

interface SaveMySectionResult {
  savedCount: number;
  conflicts: ConflictDetail[];
}

export async function saveMySection(
  ctx: RequestContext,
  input: SaveMySectionInput,
): Promise<SaveMySectionResult> {
  return withTenant(ctx.tenantId, async (tx) => {
    // If clearing selection, just delete and return
    if (input.tableIds.length === 0) {
      await tx.execute(sql`
        DELETE FROM fnb_my_section_tables
        WHERE tenant_id = ${ctx.tenantId}
          AND server_user_id = ${ctx.user.id}
          AND room_id = ${input.roomId}
          AND business_date = ${input.businessDate}
      `);
      return { savedCount: 0, conflicts: [] };
    }

    // Validate all table IDs belong to this room and tenant
    const tableIdList = sql.join(input.tableIds.map((id) => sql`${id}`), sql`, `);
    const validTables = await tx.execute(sql`
      SELECT id FROM fnb_tables
      WHERE tenant_id = ${ctx.tenantId}
        AND room_id = ${input.roomId}
        AND is_active = true
        AND id IN (${tableIdList})
    `);
    const validIds = new Set(
      Array.from(validTables as Iterable<Record<string, unknown>>).map((r) => String(r.id)),
    );
    const filteredTableIds = input.tableIds.filter((id) => validIds.has(id));

    if (filteredTableIds.length === 0) {
      return { savedCount: 0, conflicts: [] };
    }

    // Check for conflicts: tables claimed by OTHER servers for this date
    const filteredIdList = sql.join(filteredTableIds.map((id) => sql`${id}`), sql`, `);
    const conflictRows = await tx.execute(sql`
      SELECT
        m.table_id,
        m.server_user_id,
        u.display_name AS server_name
      FROM fnb_my_section_tables m
      LEFT JOIN users u ON u.id = m.server_user_id
      WHERE m.tenant_id = ${ctx.tenantId}
        AND m.business_date = ${input.businessDate}
        AND m.server_user_id != ${ctx.user.id}
        AND m.table_id IN (${filteredIdList})
    `);

    const conflicts: ConflictDetail[] = Array.from(
      conflictRows as Iterable<Record<string, unknown>>,
    ).map((r) => ({
      tableId: String(r.table_id),
      claimedByUserId: String(r.server_user_id),
      claimedByName: r.server_name ? String(r.server_name) : null,
    }));

    // Remove conflicted tables from the save set
    const conflictedIds = new Set(conflicts.map((c) => c.tableId));
    const savableIds = filteredTableIds.filter((id) => !conflictedIds.has(id));

    // Delete existing claims for this server + room + date
    await tx.execute(sql`
      DELETE FROM fnb_my_section_tables
      WHERE tenant_id = ${ctx.tenantId}
        AND server_user_id = ${ctx.user.id}
        AND room_id = ${input.roomId}
        AND business_date = ${input.businessDate}
    `);

    // Insert new claims
    if (savableIds.length > 0) {
      // Resolve locationId from room
      const roomRows = await tx.execute(sql`
        SELECT location_id FROM floor_plan_rooms
        WHERE id = ${input.roomId} AND tenant_id = ${ctx.tenantId}
        LIMIT 1
      `);
      const roomRow = Array.from(roomRows as Iterable<Record<string, unknown>>)[0];
      const locationId = roomRow ? String(roomRow.location_id) : ctx.locationId;
      if (!locationId) {
        throw new Error('Location ID is required to save my section');
      }

      const values = savableIds.map((tableId) =>
        sql`(${generateUlid()}, ${ctx.tenantId}, ${locationId}, ${input.roomId}, ${ctx.user.id}, ${tableId}, ${input.businessDate}, NOW())`,
      );

      await tx.execute(sql`
        INSERT INTO fnb_my_section_tables (id, tenant_id, location_id, room_id, server_user_id, table_id, business_date, created_at)
        VALUES ${sql.join(values, sql`, `)}
      `);
    }

    return { savedCount: savableIds.length, conflicts };
  });
}
