/**
 * Get Tag Action Executions Query
 *
 * Returns the execution history for tag actions with filtering by
 * customer, tag, status, and date range. Cursor-paginated.
 */

import { eq, and, desc, lte, gte, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { tagActionExecutions, tagActions } from '@oppsera/db';

function encodeCursor(...parts: string[]): string {
  return parts.join('|');
}

function decodeCursor(cursor: string, expectedParts: number): string[] | null {
  const parts = cursor.split('|');
  if (parts.length !== expectedParts) return null; // Legacy fallback
  return parts;
}

export interface GetTagActionExecutionsInput {
  tenantId: string;
  tagId?: string;
  customerId?: string;
  status?: 'success' | 'failed' | 'skipped';
  from?: string; // ISO date
  to?: string;   // ISO date
  cursor?: string;
  limit?: number;
}

export interface TagActionExecutionEntry {
  id: string;
  tagActionId: string;
  actionType: string;
  customerId: string;
  trigger: string;
  status: string;
  resultSummary: Record<string, unknown> | null;
  errorMessage: string | null;
  durationMs: number | null;
  executedAt: string;
}

export interface GetTagActionExecutionsResult {
  items: TagActionExecutionEntry[];
  cursor: string | null;
  hasMore: boolean;
}

export async function getTagActionExecutions(
  input: GetTagActionExecutionsInput,
): Promise<GetTagActionExecutionsResult> {
  const limit = Math.min(input.limit ?? 50, 200);

  return withTenant(input.tenantId, async (tx) => {
    const conditions: unknown[] = [
      eq(tagActionExecutions.tenantId, input.tenantId),
    ];

    if (input.customerId) {
      conditions.push(eq(tagActionExecutions.customerId, input.customerId));
    }

    if (input.status) {
      conditions.push(eq(tagActionExecutions.status, input.status));
    }

    if (input.from) {
      conditions.push(gte(tagActionExecutions.executedAt, new Date(input.from)));
    }

    if (input.to) {
      conditions.push(lte(tagActionExecutions.executedAt, new Date(input.to)));
    }

    if (input.cursor) {
      const decoded = decodeCursor(input.cursor, 2);
      if (decoded) {
        const [cursorExecutedAt, cursorId] = decoded as [string, string];
        conditions.push(
          sql`(${tagActionExecutions.executedAt}, ${tagActionExecutions.id}) < (${cursorExecutedAt}::timestamptz, ${cursorId})`,
        );
      } else {
        // Legacy: cursor was plain id (was using gt incorrectly — fall back to lt for DESC)
        conditions.push(
          sql`${tagActionExecutions.id} < ${input.cursor}`,
        );
      }
    }

    // If tagId is specified, filter to actions belonging to that tag
    let query;
    if (input.tagId) {
      query = tx
        .select({
          id: tagActionExecutions.id,
          tagActionId: tagActionExecutions.tagActionId,
          actionType: tagActions.actionType,
          customerId: tagActionExecutions.customerId,
          trigger: tagActionExecutions.trigger,
          status: tagActionExecutions.status,
          resultSummary: tagActionExecutions.resultSummary,
          errorMessage: tagActionExecutions.errorMessage,
          durationMs: tagActionExecutions.durationMs,
          executedAt: tagActionExecutions.executedAt,
        })
        .from(tagActionExecutions)
        .innerJoin(tagActions, eq(tagActions.id, tagActionExecutions.tagActionId))
        .where(and(...(conditions as Parameters<typeof and>), eq(tagActions.tagId, input.tagId)))
        .orderBy(desc(tagActionExecutions.executedAt), desc(tagActionExecutions.id))
        .limit(limit + 1);
    } else {
      query = tx
        .select({
          id: tagActionExecutions.id,
          tagActionId: tagActionExecutions.tagActionId,
          actionType: tagActions.actionType,
          customerId: tagActionExecutions.customerId,
          trigger: tagActionExecutions.trigger,
          status: tagActionExecutions.status,
          resultSummary: tagActionExecutions.resultSummary,
          errorMessage: tagActionExecutions.errorMessage,
          durationMs: tagActionExecutions.durationMs,
          executedAt: tagActionExecutions.executedAt,
        })
        .from(tagActionExecutions)
        .innerJoin(tagActions, eq(tagActions.id, tagActionExecutions.tagActionId))
        .where(and(...(conditions as Parameters<typeof and>)))
        .orderBy(desc(tagActionExecutions.executedAt), desc(tagActionExecutions.id))
        .limit(limit + 1);
    }

    const rows = await query;
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    const lastItem = items[items.length - 1];
    return {
      items: items.map((r) => ({
        id: r.id,
        tagActionId: r.tagActionId,
        actionType: r.actionType ?? 'unknown',
        customerId: r.customerId,
        trigger: r.trigger,
        status: r.status,
        resultSummary: (r.resultSummary as Record<string, unknown>) ?? null,
        errorMessage: r.errorMessage ?? null,
        durationMs: r.durationMs ?? null,
        executedAt: r.executedAt instanceof Date ? r.executedAt.toISOString() : String(r.executedAt),
      })),
      cursor: hasMore && lastItem
        ? encodeCursor(
            lastItem.executedAt instanceof Date
              ? lastItem.executedAt.toISOString()
              : String(lastItem.executedAt),
            lastItem.id,
          )
        : null,
      hasMore,
    };
  });
}
