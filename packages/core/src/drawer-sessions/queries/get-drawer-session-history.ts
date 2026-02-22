import { withTenant } from '@oppsera/db';
import { drawerSessions } from '@oppsera/db';
import { eq, and, lt, desc, gte, lte } from 'drizzle-orm';
import type { DrawerSession } from '../types';

function mapRow(row: typeof drawerSessions.$inferSelect): DrawerSession {
  return {
    id: row.id,
    tenantId: row.tenantId,
    locationId: row.locationId,
    terminalId: row.terminalId,
    profitCenterId: row.profitCenterId,
    employeeId: row.employeeId,
    businessDate: row.businessDate,
    status: row.status as 'open' | 'closed',
    openingBalanceCents: row.openingBalanceCents,
    changeFundCents: row.changeFundCents,
    closingCountCents: row.closingCountCents,
    expectedCashCents: row.expectedCashCents,
    varianceCents: row.varianceCents,
    openedAt: row.openedAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
    closedBy: row.closedBy,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface GetDrawerSessionHistoryInput {
  tenantId: string;
  terminalId?: string;
  locationId?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: 'open' | 'closed';
  cursor?: string;
  limit?: number;
}

export interface GetDrawerSessionHistoryResult {
  items: DrawerSession[];
  cursor: string | null;
  hasMore: boolean;
}

export async function getDrawerSessionHistory(
  input: GetDrawerSessionHistoryInput,
): Promise<GetDrawerSessionHistoryResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [eq(drawerSessions.tenantId, input.tenantId)];

    if (input.terminalId) {
      conditions.push(eq(drawerSessions.terminalId, input.terminalId));
    }
    if (input.locationId) {
      conditions.push(eq(drawerSessions.locationId, input.locationId));
    }
    if (input.status) {
      conditions.push(eq(drawerSessions.status, input.status));
    }
    if (input.dateFrom) {
      conditions.push(gte(drawerSessions.businessDate, input.dateFrom));
    }
    if (input.dateTo) {
      conditions.push(lte(drawerSessions.businessDate, input.dateTo));
    }
    if (input.cursor) {
      conditions.push(lt(drawerSessions.id, input.cursor));
    }

    const rows = await tx
      .select()
      .from(drawerSessions)
      .where(and(...conditions))
      .orderBy(desc(drawerSessions.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return {
      items: items.map(mapRow),
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}
