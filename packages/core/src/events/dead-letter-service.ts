import { sql, eq, and, desc } from 'drizzle-orm';
import { db, eventDeadLetters } from '@oppsera/db';
import type { EventBus } from './bus';

export interface DeadLetterEntry {
  id: string;
  tenantId: string | null;
  eventId: string;
  eventType: string;
  eventData: Record<string, unknown>;
  consumerName: string;
  errorMessage: string | null;
  errorStack: string | null;
  attemptCount: number;
  maxRetries: number;
  firstFailedAt: string;
  lastFailedAt: string;
  status: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNotes: string | null;
  createdAt: string;
}

export interface DeadLetterStats {
  totalFailed: number;
  totalRetrying: number;
  totalResolved: number;
  totalDiscarded: number;
  byEventType: Array<{ eventType: string; count: number }>;
  byConsumer: Array<{ consumerName: string; count: number }>;
}

export interface ListDeadLettersInput {
  status?: string;
  eventType?: string;
  consumerName?: string;
  tenantId?: string;
  cursor?: string;
  limit?: number;
}

function mapRow(row: typeof eventDeadLetters.$inferSelect): DeadLetterEntry {
  return {
    id: row.id,
    tenantId: row.tenantId,
    eventId: row.eventId,
    eventType: row.eventType,
    eventData: row.eventData as Record<string, unknown>,
    consumerName: row.consumerName,
    errorMessage: row.errorMessage,
    errorStack: row.errorStack,
    attemptCount: row.attemptCount,
    maxRetries: row.maxRetries,
    firstFailedAt: row.firstFailedAt.toISOString(),
    lastFailedAt: row.lastFailedAt.toISOString(),
    status: row.status,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolvedBy: row.resolvedBy,
    resolutionNotes: row.resolutionNotes,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listDeadLetters(
  input: ListDeadLettersInput,
): Promise<{ items: DeadLetterEntry[]; cursor: string | null; hasMore: boolean }> {
  const limit = input.limit ?? 50;
  const conditions = [];

  if (input.status) {
    conditions.push(eq(eventDeadLetters.status, input.status));
  }
  if (input.eventType) {
    conditions.push(eq(eventDeadLetters.eventType, input.eventType));
  }
  if (input.consumerName) {
    conditions.push(eq(eventDeadLetters.consumerName, input.consumerName));
  }
  if (input.tenantId) {
    conditions.push(eq(eventDeadLetters.tenantId, input.tenantId));
  }
  if (input.cursor) {
    conditions.push(sql`${eventDeadLetters.id} < ${input.cursor}`);
  }

  const rows = await db
    .select()
    .from(eventDeadLetters)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(eventDeadLetters.createdAt), desc(eventDeadLetters.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  return {
    items: items.map(mapRow),
    cursor: hasMore ? items[items.length - 1]!.id : null,
    hasMore,
  };
}

export async function getDeadLetter(id: string): Promise<DeadLetterEntry | null> {
  const [row] = await db
    .select()
    .from(eventDeadLetters)
    .where(eq(eventDeadLetters.id, id))
    .limit(1);

  return row ? mapRow(row) : null;
}

export async function getDeadLetterStats(): Promise<DeadLetterStats> {
  const statusRows = await db.execute(sql`
    SELECT status, COUNT(*)::int AS count
    FROM event_dead_letters
    GROUP BY status
  `);
  const statusArr = Array.from(statusRows as Iterable<Record<string, unknown>>);

  let totalFailed = 0;
  let totalRetrying = 0;
  let totalResolved = 0;
  let totalDiscarded = 0;

  for (const row of statusArr) {
    const count = Number(row.count ?? 0);
    switch (row.status) {
      case 'failed':
        totalFailed = count;
        break;
      case 'retrying':
        totalRetrying = count;
        break;
      case 'resolved':
        totalResolved = count;
        break;
      case 'discarded':
        totalDiscarded = count;
        break;
    }
  }

  const typeRows = await db.execute(sql`
    SELECT event_type, COUNT(*)::int AS count
    FROM event_dead_letters
    WHERE status IN ('failed', 'retrying')
    GROUP BY event_type
    ORDER BY count DESC
    LIMIT 20
  `);
  const byEventType = Array.from(typeRows as Iterable<Record<string, unknown>>).map((r) => ({
    eventType: String(r.event_type),
    count: Number(r.count),
  }));

  const consumerRows = await db.execute(sql`
    SELECT consumer_name, COUNT(*)::int AS count
    FROM event_dead_letters
    WHERE status IN ('failed', 'retrying')
    GROUP BY consumer_name
    ORDER BY count DESC
    LIMIT 20
  `);
  const byConsumer = Array.from(consumerRows as Iterable<Record<string, unknown>>).map((r) => ({
    consumerName: String(r.consumer_name),
    count: Number(r.count),
  }));

  return { totalFailed, totalRetrying, totalResolved, totalDiscarded, byEventType, byConsumer };
}

export async function retryDeadLetter(
  id: string,
  eventBus: EventBus,
): Promise<{ success: boolean; error?: string }> {
  const [row] = await db
    .select()
    .from(eventDeadLetters)
    .where(eq(eventDeadLetters.id, id))
    .limit(1);

  if (!row) return { success: false, error: 'Dead letter not found' };
  if (row.status !== 'failed') return { success: false, error: `Cannot retry entry with status '${row.status}'` };

  // Mark as retrying
  await db
    .update(eventDeadLetters)
    .set({ status: 'retrying', lastFailedAt: new Date() })
    .where(eq(eventDeadLetters.id, id));

  try {
    // Re-publish through the event bus
    const eventData = row.eventData as Record<string, unknown>;
    await eventBus.publish(eventData as any);

    // Mark as resolved
    await db
      .update(eventDeadLetters)
      .set({
        status: 'resolved',
        resolvedAt: new Date(),
        resolvedBy: 'system:retry',
        resolutionNotes: 'Automatically resolved via retry',
      })
      .where(eq(eventDeadLetters.id, id));

    return { success: true };
  } catch (err) {
    // Re-failed — increment attempt count and mark as failed again
    await db
      .update(eventDeadLetters)
      .set({
        status: 'failed',
        attemptCount: row.attemptCount + 1,
        lastFailedAt: new Date(),
        errorMessage: err instanceof Error ? err.message : String(err),
        errorStack: err instanceof Error ? err.stack ?? null : null,
      })
      .where(eq(eventDeadLetters.id, id));

    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function resolveDeadLetter(
  id: string,
  resolvedBy: string,
  notes?: string,
): Promise<boolean> {
  const result = await db
    .update(eventDeadLetters)
    .set({
      status: 'resolved',
      resolvedAt: new Date(),
      resolvedBy,
      resolutionNotes: notes ?? null,
    })
    .where(and(eq(eventDeadLetters.id, id), eq(eventDeadLetters.status, 'failed')))
    .returning({ id: eventDeadLetters.id });

  return result.length > 0;
}

export async function discardDeadLetter(
  id: string,
  resolvedBy: string,
  notes?: string,
): Promise<boolean> {
  const result = await db
    .update(eventDeadLetters)
    .set({
      status: 'discarded',
      resolvedAt: new Date(),
      resolvedBy,
      resolutionNotes: notes ?? null,
    })
    .where(and(eq(eventDeadLetters.id, id), eq(eventDeadLetters.status, 'failed')))
    .returning({ id: eventDeadLetters.id });

  return result.length > 0;
}
