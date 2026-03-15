import { eq, and, lt, desc, asc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import {
  aiAssistantThreads,
  aiAssistantMessages,
} from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';

// ── List Threads ────────────────────────────────────────────────────

export interface ListThreadsInput {
  tenantId: string;
  userId: string;
  cursor?: string;
  limit?: number;
}

export type ThreadListRow = typeof aiAssistantThreads.$inferSelect;

export interface ListThreadsResult {
  threads: ThreadListRow[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listThreads(input: ListThreadsInput): Promise<ListThreadsResult> {
  const limit = Math.min(input.limit ?? 20, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      eq(aiAssistantThreads.tenantId, input.tenantId),
      eq(aiAssistantThreads.userId, input.userId),
    ];

    if (input.cursor) {
      conditions.push(lt(aiAssistantThreads.id, input.cursor));
    }

    const rows = await tx
      .select()
      .from(aiAssistantThreads)
      .where(and(...conditions))
      .orderBy(desc(aiAssistantThreads.createdAt), desc(aiAssistantThreads.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const lastItem = items[items.length - 1];
    const nextCursor = hasMore && lastItem ? lastItem.id : null;

    return { threads: items, cursor: nextCursor, hasMore };
  });
}

// ── Get Thread ──────────────────────────────────────────────────────

export interface ThreadDetail {
  thread: typeof aiAssistantThreads.$inferSelect;
  messages: Array<typeof aiAssistantMessages.$inferSelect>;
}

export async function getThread(tenantId: string, threadId: string, userId: string): Promise<ThreadDetail> {
  return withTenant(tenantId, async (tx) => {
    const [thread] = await tx
      .select()
      .from(aiAssistantThreads)
      .where(
        and(
          eq(aiAssistantThreads.id, threadId),
          eq(aiAssistantThreads.tenantId, tenantId),
          eq(aiAssistantThreads.userId, userId),
        ),
      )
      .limit(1);

    if (!thread) {
      throw new NotFoundError('Thread', threadId);
    }

    const messages = await tx
      .select()
      .from(aiAssistantMessages)
      .where(
        and(
          eq(aiAssistantMessages.threadId, threadId),
          eq(aiAssistantMessages.tenantId, tenantId),
        ),
      )
      .orderBy(asc(aiAssistantMessages.createdAt));

    return { thread, messages };
  });
}

// ── Get Thread Messages (paginated) ─────────────────────────────────

export interface GetThreadMessagesInput {
  tenantId: string;
  userId: string;
  threadId: string;
  cursor?: string;
  limit?: number;
}

export type MessageRow = typeof aiAssistantMessages.$inferSelect;

export interface GetThreadMessagesResult {
  messages: MessageRow[];
  cursor: string | null;
  hasMore: boolean;
}

export async function getThreadMessages(
  input: GetThreadMessagesInput,
): Promise<GetThreadMessagesResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    // Verify thread exists and belongs to this tenant + user
    const [thread] = await tx
      .select({ id: aiAssistantThreads.id })
      .from(aiAssistantThreads)
      .where(
        and(
          eq(aiAssistantThreads.id, input.threadId),
          eq(aiAssistantThreads.tenantId, input.tenantId),
          eq(aiAssistantThreads.userId, input.userId),
        ),
      )
      .limit(1);

    if (!thread) {
      throw new NotFoundError('Thread', input.threadId);
    }

    const conditions = [
      eq(aiAssistantMessages.threadId, input.threadId),
      eq(aiAssistantMessages.tenantId, input.tenantId),
    ];

    if (input.cursor) {
      conditions.push(lt(aiAssistantMessages.id, input.cursor));
    }

    const rows = await tx
      .select()
      .from(aiAssistantMessages)
      .where(and(...conditions))
      .orderBy(desc(aiAssistantMessages.createdAt), desc(aiAssistantMessages.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const lastItem = items[items.length - 1];
    const nextCursor = hasMore && lastItem ? lastItem.id : null;

    return { messages: items, cursor: nextCursor, hasMore };
  });
}
