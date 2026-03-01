import { eq, and, gte, lte, desc, asc, sql } from 'drizzle-orm';
import { withTenant, spaRoomTurnoverTasks } from '@oppsera/db';

export interface TurnoverTaskRow {
  id: string;
  resourceId: string;
  appointmentId: string | null;
  taskType: string;
  assignedTo: string | null;
  status: string;
  dueAt: string;
  completedAt: string | null;
  notes: string | null;
  checklist: Array<{ item: string; completed: boolean }> | null;
  createdAt: string;
}

export interface TurnoverStatsResult {
  totalTasks: number;
  completedTasks: number;
  skippedTasks: number;
  avgCompletionMinutes: number;
}

interface ListTurnoverTasksInput {
  tenantId: string;
  resourceId?: string;
  status?: string;
  taskType?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  cursor?: string;
}

interface GetTurnoverTasksByResourceInput {
  tenantId: string;
  resourceId: string;
  businessDate: string;
}

interface GetTurnoverStatsInput {
  tenantId: string;
  dateFrom: string;
  dateTo: string;
}

function mapRow(row: typeof spaRoomTurnoverTasks.$inferSelect): TurnoverTaskRow {
  return {
    id: row.id,
    resourceId: row.resourceId,
    appointmentId: row.appointmentId ?? null,
    taskType: row.taskType,
    assignedTo: row.assignedTo ?? null,
    status: row.status,
    dueAt: row.dueAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    notes: row.notes ?? null,
    checklist: (row.checklist as Array<{ item: string; completed: boolean }>) ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listTurnoverTasks(
  input: ListTurnoverTasksInput
): Promise<{ items: TurnoverTaskRow[]; cursor: string | null; hasMore: boolean }> {
  const limit = input.limit ?? 50;

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [];

    if (input.resourceId) {
      conditions.push(eq(spaRoomTurnoverTasks.resourceId, input.resourceId));
    }
    if (input.status) {
      conditions.push(eq(spaRoomTurnoverTasks.status, input.status));
    }
    if (input.taskType) {
      conditions.push(eq(spaRoomTurnoverTasks.taskType, input.taskType));
    }
    if (input.dateFrom) {
      conditions.push(gte(spaRoomTurnoverTasks.dueAt, new Date(input.dateFrom)));
    }
    if (input.dateTo) {
      conditions.push(lte(spaRoomTurnoverTasks.dueAt, new Date(input.dateTo)));
    }
    if (input.cursor) {
      conditions.push(lte(spaRoomTurnoverTasks.id, input.cursor));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await tx
      .select()
      .from(spaRoomTurnoverTasks)
      .where(where)
      .orderBy(desc(spaRoomTurnoverTasks.id))
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

export async function getTurnoverTasksByResource(
  input: GetTurnoverTasksByResourceInput
): Promise<TurnoverTaskRow[]> {
  return withTenant(input.tenantId, async (tx) => {
    const dateStart = new Date(input.businessDate);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(input.businessDate);
    dateEnd.setHours(23, 59, 59, 999);

    const rows = await tx
      .select()
      .from(spaRoomTurnoverTasks)
      .where(
        and(
          eq(spaRoomTurnoverTasks.resourceId, input.resourceId),
          gte(spaRoomTurnoverTasks.dueAt, dateStart),
          lte(spaRoomTurnoverTasks.dueAt, dateEnd)
        )
      )
      .orderBy(asc(spaRoomTurnoverTasks.dueAt));

    return rows.map(mapRow);
  });
}

export async function getTurnoverStats(
  input: GetTurnoverStatsInput
): Promise<TurnoverStatsResult> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      gte(spaRoomTurnoverTasks.dueAt, new Date(input.dateFrom)),
      lte(spaRoomTurnoverTasks.dueAt, new Date(input.dateTo)),
    ];

    const where = and(...conditions);

    const result = await tx
      .select({
        totalTasks: sql<number>`COUNT(*)::int`,
        completedTasks: sql<number>`COUNT(*) FILTER (WHERE ${spaRoomTurnoverTasks.status} = 'completed')::int`,
        skippedTasks: sql<number>`COUNT(*) FILTER (WHERE ${spaRoomTurnoverTasks.status} = 'skipped')::int`,
        avgCompletionMinutes: sql<number>`COALESCE(
          AVG(
            EXTRACT(EPOCH FROM (${spaRoomTurnoverTasks.completedAt} - ${spaRoomTurnoverTasks.dueAt})) / 60
          ) FILTER (WHERE ${spaRoomTurnoverTasks.status} = 'completed' AND ${spaRoomTurnoverTasks.completedAt} IS NOT NULL),
          0
        )::float`,
      })
      .from(spaRoomTurnoverTasks)
      .where(where);

    const row = result[0];

    return {
      totalTasks: row?.totalTasks ?? 0,
      completedTasks: row?.completedTasks ?? 0,
      skippedTasks: row?.skippedTasks ?? 0,
      avgCompletionMinutes: Math.round((row?.avgCompletionMinutes ?? 0) * 100) / 100,
    };
  });
}
