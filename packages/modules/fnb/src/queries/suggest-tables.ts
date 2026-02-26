import { withTenant } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import type { SuggestTablesInput, TableSuggestion, AvailableTable, ServerLoad, CustomerTableHistory } from '../services/table-assigner';
import { computeTableSuggestions } from '../services/table-assigner';

/**
 * HOST V2: Suggest optimal tables for a party.
 * Fetches data from DB and delegates to the pure scoring algorithm.
 */
export async function suggestTables(input: SuggestTablesInput): Promise<TableSuggestion[]> {
  return withTenant(input.tenantId, async (tx) => {
    // 1. Get all available tables at location
    const tableRows = await tx.execute(sql`
      SELECT
        t.id,
        t.table_number,
        t.capacity_max AS capacity,
        t.section_id,
        t.is_combinable,
        s.assigned_server_id AS server_id,
        u.display_name AS server_name
      FROM fnb_tables t
      LEFT JOIN fnb_sections s ON s.id = t.section_id AND s.tenant_id = t.tenant_id
      LEFT JOIN users u ON u.id = s.assigned_server_id
      WHERE t.tenant_id = ${input.tenantId}
        AND t.location_id = ${input.locationId}
        AND t.status = 'available'
        AND t.is_active = true
    `);

    const tables: AvailableTable[] = Array.from(
      tableRows as Iterable<Record<string, unknown>>,
    ).map((row) => ({
      id: String(row.id),
      tableNumber: String(row.table_number),
      capacity: Number(row.capacity),
      sectionId: row.section_id ? String(row.section_id) : undefined,
      serverId: row.server_id ? String(row.server_id) : undefined,
      serverName: row.server_name ? String(row.server_name) : undefined,
      tags: [],  // Tags come from room layout metadata — populated below
      isCombinable: Boolean(row.is_combinable),
      adjacentTableIds: [],  // Populated below
    }));

    if (tables.length === 0) return [];

    // 2. Get table tags (from room layout object properties)
    const tableIds = tables.map((t) => t.id);
    const tagRows = await tx.execute(sql`
      SELECT id, seating_preference
      FROM fnb_tables
      WHERE tenant_id = ${input.tenantId}
        AND id = ANY(${tableIds})
        AND seating_preference IS NOT NULL
    `);
    const tagMap = new Map<string, string[]>();
    for (const row of Array.from(tagRows as Iterable<Record<string, unknown>>)) {
      const pref = String(row.seating_preference ?? '');
      if (pref) tagMap.set(String(row.id), [pref]);
    }
    for (const table of tables) {
      table.tags = tagMap.get(table.id) ?? [];
    }

    // 3. Get server load (covers per server from active turn log entries)
    const serverRows = await tx.execute(sql`
      SELECT
        s.assigned_server_id AS server_id,
        COALESCE(SUM(tl.party_size), 0) AS current_covers
      FROM fnb_sections s
      LEFT JOIN fnb_tables t2 ON t2.section_id = s.id
        AND t2.tenant_id = s.tenant_id
        AND t2.status = 'occupied'
      LEFT JOIN fnb_table_turn_log tl ON tl.table_id = t2.id
        AND tl.tenant_id = t2.tenant_id
        AND tl.cleared_at IS NULL
      WHERE s.tenant_id = ${input.tenantId}
        AND s.location_id = ${input.locationId}
        AND s.assigned_server_id IS NOT NULL
      GROUP BY s.assigned_server_id
    `);
    const serverLoads: ServerLoad[] = Array.from(
      serverRows as Iterable<Record<string, unknown>>,
    ).map((row) => ({
      serverId: String(row.server_id),
      currentCovers: Number(row.current_covers),
    }));

    // 4. Get customer table history (if VIP and customerId provided)
    let customerHistory: CustomerTableHistory[] = [];
    if (input.isVip && input.customerId) {
      const historyRows = await tx.execute(sql`
        SELECT
          tl.table_id,
          COUNT(*) AS visit_count
        FROM fnb_table_turn_log tl
        JOIN fnb_reservations r ON r.id = tl.reservation_id AND r.tenant_id = tl.tenant_id
        WHERE tl.tenant_id = ${input.tenantId}
          AND tl.location_id = ${input.locationId}
          AND r.customer_id = ${input.customerId}
        GROUP BY tl.table_id
        ORDER BY visit_count DESC
        LIMIT 5
      `);
      customerHistory = Array.from(
        historyRows as Iterable<Record<string, unknown>>,
      ).map((row) => ({
        tableId: String(row.table_id),
        visitCount: Number(row.visit_count),
      }));
    }

    return computeTableSuggestions(
      tables,
      input.partySize,
      input.seatingPreference,
      input.isVip ?? false,
      serverLoads,
      customerHistory,
    );
  });
}
