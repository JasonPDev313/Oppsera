import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { withTenant, spaDailyOperations } from '@oppsera/db';

export interface DailyOperationsRow {
  id: string;
  locationId: string;
  businessDate: string;
  openingChecklist: Array<{ item: string; completed: boolean; completedBy?: string }> | null;
  closingChecklist: Array<{ item: string; completed: boolean; completedBy?: string }> | null;
  openedBy: string | null;
  openedAt: string | null;
  closedBy: string | null;
  closedAt: string | null;
  notes: string | null;
  incidents: Array<{ description: string; severity: string; reportedBy: string; reportedAt: string }> | null;
  createdAt: string;
}

interface GetDailyOperationsInput {
  tenantId: string;
  locationId: string;
  businessDate: string;
}

interface ListDailyOperationsInput {
  tenantId: string;
  locationId?: string;
  dateFrom: string;
  dateTo: string;
  limit?: number;
  cursor?: string;
}

function mapRow(row: typeof spaDailyOperations.$inferSelect): DailyOperationsRow {
  return {
    id: row.id,
    locationId: row.locationId,
    businessDate: row.businessDate,
    openingChecklist: (row.openingChecklist as Array<{ item: string; completed: boolean; completedBy?: string }>) ?? null,
    closingChecklist: (row.closingChecklist as Array<{ item: string; completed: boolean; completedBy?: string }>) ?? null,
    openedBy: row.openedBy ?? null,
    openedAt: row.openedAt?.toISOString() ?? null,
    closedBy: row.closedBy ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    notes: row.notes ?? null,
    incidents: (row.incidents as Array<{ description: string; severity: string; reportedBy: string; reportedAt: string }>) ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getDailyOperations(
  input: GetDailyOperationsInput
): Promise<DailyOperationsRow | null> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(spaDailyOperations)
      .where(
        and(
          eq(spaDailyOperations.locationId, input.locationId),
          eq(spaDailyOperations.businessDate, input.businessDate)
        )
      )
      .limit(1);

    if (rows.length === 0) return null;
    return mapRow(rows[0]!);
  });
}

export async function listDailyOperations(
  input: ListDailyOperationsInput
): Promise<{ items: DailyOperationsRow[]; cursor: string | null; hasMore: boolean }> {
  const limit = input.limit ?? 50;

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      gte(spaDailyOperations.businessDate, input.dateFrom),
      lte(spaDailyOperations.businessDate, input.dateTo),
    ];

    if (input.locationId) {
      conditions.push(eq(spaDailyOperations.locationId, input.locationId));
    }
    if (input.cursor) {
      conditions.push(lte(spaDailyOperations.id, input.cursor));
    }

    const where = and(...conditions);

    const rows = await tx
      .select()
      .from(spaDailyOperations)
      .where(where)
      .orderBy(desc(spaDailyOperations.businessDate), desc(spaDailyOperations.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const mappedItems = items.map(mapRow);

    return {
      items: mappedItems,
      cursor: hasMore ? mappedItems[mappedItems.length - 1]!.id : null,
      hasMore,
    };
  });
}
