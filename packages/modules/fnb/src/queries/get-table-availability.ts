import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GetTableAvailabilityInput } from '../validation';

export interface AvailableTableForSeating {
  tableId: string;
  displayLabel: string;
  minCapacity: number;
  maxCapacity: number;
  tableType: string;
  shape: string;
  sectionId: string | null;
  sectionName: string | null;
  serverUserId: string | null;
  serverName: string | null;
  currentStatus: string;
  roomId: string | null;
  roomName: string | null;
  /** Score 0-100 indicating how well this table fits the request */
  fitScore: number;
  /** Why this table was suggested */
  fitReason: string;
}

export interface TableAvailabilityResult {
  suggestedTables: AvailableTableForSeating[];
  allAvailable: AvailableTableForSeating[];
  totalAvailable: number;
  totalTables: number;
}

/**
 * Finds available tables ranked by suitability for a given party size and preferences.
 * Uses a scoring algorithm that considers:
 * - Capacity match (prefer smallest table that fits)
 * - Seating preference match
 * - Server rotation (prefer next-up server's section)
 * - Table type preference
 */
export async function getTableAvailability(
  input: GetTableAvailabilityInput,
): Promise<TableAvailabilityResult> {
  return withTenant(input.tenantId, async (tx) => {
    const [tableRows, rotationRows] = await Promise.all([
      tx.execute(sql`
        SELECT
          t.id AS table_id,
          t.display_label,
          t.min_capacity,
          t.max_capacity,
          t.table_type,
          t.shape,
          t.room_id,
          r.name AS room_name,
          COALESCE(ls.status, 'available') AS current_status,
          sa.section_id,
          s.name AS section_name,
          sa.server_user_id,
          u.name AS server_name
        FROM fnb_tables t
        LEFT JOIN fnb_table_live_status ls ON ls.table_id = t.id AND ls.tenant_id = t.tenant_id
        LEFT JOIN floor_plan_rooms r ON r.id = t.room_id AND r.tenant_id = t.tenant_id
        LEFT JOIN fnb_sections sec ON sec.tenant_id = t.tenant_id AND sec.location_id = t.location_id
        LEFT JOIN fnb_server_assignments sa ON sa.section_id = sec.id
          AND sa.tenant_id = t.tenant_id
          AND sa.business_date = ${input.businessDate}
          AND sa.status = 'active'
        LEFT JOIN fnb_sections s ON s.id = sa.section_id
        LEFT JOIN users u ON u.id = sa.server_user_id
        WHERE t.tenant_id = ${input.tenantId}
          AND t.location_id = ${input.locationId}
          AND t.is_active = true
        ORDER BY t.max_capacity ASC, t.display_label ASC
      `),

      // Get next-up server for rotation bonus
      tx.execute(sql`
        SELECT next_server_user_id
        FROM fnb_rotation_tracker
        WHERE tenant_id = ${input.tenantId}
          AND location_id = ${input.locationId}
          AND business_date = ${input.businessDate}
        LIMIT 1
      `),
    ]);

    const allTables = Array.from(tableRows as Iterable<Record<string, unknown>>);
    const rotation = Array.from(rotationRows as Iterable<Record<string, unknown>>);
    const nextUpServer = rotation.length > 0 ? String(rotation[0]!.next_server_user_id) : null;

    const partySize = input.partySize;
    const preference = input.seatingPreference ?? null;

    // Deduplicate tables (may appear multiple times with different server assignments)
    const tableMap = new Map<string, Record<string, unknown>>();
    for (const row of allTables) {
      const id = String(row.table_id);
      if (!tableMap.has(id)) {
        tableMap.set(id, row);
      }
    }

    const mapped: AvailableTableForSeating[] = [];

    for (const row of tableMap.values()) {
      const maxCap = Number(row.max_capacity);
      const minCap = Number(row.min_capacity);
      const status = String(row.current_status);
      const tableType = String(row.table_type);
      const serverUserId = row.server_user_id ? String(row.server_user_id) : null;

      // Base score for available tables
      let fitScore = 0;
      const reasons: string[] = [];

      if (status === 'available') {
        fitScore = 50; // Base score for being available

        // Capacity match (0-25 points)
        if (maxCap >= partySize && minCap <= partySize) {
          fitScore += 25;
          reasons.push('Perfect capacity match');
        } else if (maxCap >= partySize) {
          // Penalty for oversized table (waste seats)
          const waste = maxCap - partySize;
          fitScore += Math.max(0, 20 - waste * 3);
          if (waste <= 2) reasons.push('Good capacity fit');
          else reasons.push('Oversized');
        } else {
          // Table too small
          fitScore = 0;
          reasons.push('Too small');
        }

        // Seating preference match (0-15 points)
        if (preference) {
          const pref = preference.toLowerCase();
          const type = tableType.toLowerCase();
          if (
            (pref === 'booth' && type === 'booth') ||
            (pref === 'bar' && type === 'bar_seat') ||
            (pref === 'patio' && type === 'patio') ||
            (pref === 'high_top' && type === 'high_top') ||
            (pref === 'window' && type === 'window')
          ) {
            fitScore += 15;
            reasons.push('Matches preference');
          }
        }

        // Server rotation bonus (0-10 points)
        if (nextUpServer && serverUserId === nextUpServer) {
          fitScore += 10;
          reasons.push("Next-up server's section");
        }
      }

      const entry: AvailableTableForSeating = {
        tableId: String(row.table_id),
        displayLabel: String(row.display_label),
        minCapacity: minCap,
        maxCapacity: maxCap,
        tableType,
        shape: String(row.shape),
        sectionId: row.section_id ? String(row.section_id) : null,
        sectionName: row.section_name ? String(row.section_name) : null,
        serverUserId,
        serverName: row.server_name ? String(row.server_name) : null,
        currentStatus: status,
        roomId: row.room_id ? String(row.room_id) : null,
        roomName: row.room_name ? String(row.room_name) : null,
        fitScore,
        fitReason: reasons.join(', ') || 'Available',
      };

      mapped.push(entry);
    }

    const available = mapped.filter((t) => t.currentStatus === 'available' && t.fitScore > 0);
    const suggested = [...available]
      .sort((a, b) => b.fitScore - a.fitScore)
      .slice(0, 5);

    return {
      suggestedTables: suggested,
      allAvailable: available.sort((a, b) => b.fitScore - a.fitScore),
      totalAvailable: available.length,
      totalTables: mapped.length,
    };
  });
}
