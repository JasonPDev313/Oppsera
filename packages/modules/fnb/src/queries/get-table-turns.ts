import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GetTableTurnsInput } from '../validation';

export interface TableTurnsRow {
  id: string;
  locationId: string;
  tableId: string;
  businessDate: string;
  turnsCount: number;
  avgPartySize: number | null;
  avgTurnTimeMinutes: number | null;
  avgCheckCents: number | null;
  totalRevenueCents: number;
  peakHourTurns: Array<{ hour: number; turns: number }> | null;
}

export interface TableTurnsResult {
  items: TableTurnsRow[];
}

export async function getTableTurns(
  input: GetTableTurnsInput,
): Promise<TableTurnsResult> {
  const { tenantId, locationId, startDate, endDate, tableId, limit = 50 } = input;

  return withTenant(tenantId, async (tx) => {
    const tableFilter = tableId
      ? sql` AND table_id = ${tableId}`
      : sql``;

    const rows = await tx.execute(sql`
      SELECT
        id, location_id, table_id, business_date,
        turns_count, avg_party_size, avg_turn_time_minutes,
        avg_check_cents, total_revenue_cents, peak_hour_turns
      FROM rm_fnb_table_turns
      WHERE tenant_id = ${tenantId}
        AND location_id = ${locationId}
        AND business_date >= ${startDate}
        AND business_date <= ${endDate}
        ${tableFilter}
      ORDER BY business_date DESC, total_revenue_cents DESC
      LIMIT ${limit}
    `);

    const items = Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      locationId: String(r.location_id),
      tableId: String(r.table_id),
      businessDate: String(r.business_date),
      turnsCount: Number(r.turns_count),
      avgPartySize: r.avg_party_size != null ? Number(r.avg_party_size) : null,
      avgTurnTimeMinutes: r.avg_turn_time_minutes != null ? Number(r.avg_turn_time_minutes) : null,
      avgCheckCents: r.avg_check_cents != null ? Number(r.avg_check_cents) : null,
      totalRevenueCents: Number(r.total_revenue_cents),
      peakHourTurns: (r.peak_hour_turns as Array<{ hour: number; turns: number }>) ?? null,
    }));

    return { items };
  });
}
