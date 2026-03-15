import { eq, and, asc } from 'drizzle-orm';
import { db, aiSupportEscalations, aiAssistantThreads, aiAssistantMessages, aiAssistantContextSnapshots, sql } from '@oppsera/db';

// ── Types ────────────────────────────────────────────────────────────

export interface EscalationListFilters {
  status?: string;
  priority?: string;
  tenantId?: string;
  limit?: number;
}

export interface EscalationListItem {
  id: string;
  tenantId: string;
  threadId: string;
  userId: string;
  summary: string | null;
  reason: string;
  status: string;
  priority: string;
  assignedTo: string | null;
  firstUserMessage: string | null;
  currentRoute: string | null;
  moduleKey: string | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
}

export interface EscalationDetail {
  escalation: typeof aiSupportEscalations.$inferSelect;
  thread: typeof aiAssistantThreads.$inferSelect;
  messages: Array<typeof aiAssistantMessages.$inferSelect>;
  contextSnapshots: Array<typeof aiAssistantContextSnapshots.$inferSelect>;
}

// ── List Escalations ─────────────────────────────────────────────────

export async function listEscalations(
  filters: EscalationListFilters = {},
): Promise<EscalationListItem[]> {
  const limit = Math.min(filters.limit ?? 50, 200);

  // Build conditions
  const conditions = [sql`1=1`];
  if (filters.status) conditions.push(sql`e.status = ${filters.status}`);
  if (filters.priority) conditions.push(sql`e.priority = ${filters.priority}`);
  if (filters.tenantId) conditions.push(sql`e.tenant_id = ${filters.tenantId}`);
  const whereClause = sql.join(conditions, sql` AND `);

  const rows = await db.execute(sql`
    SELECT
      e.id,
      e.tenant_id,
      e.thread_id,
      e.user_id,
      e.summary,
      e.reason,
      e.status,
      e.priority,
      e.assigned_to,
      e.resolution_notes,
      e.resolved_at,
      e.created_at,
      e.updated_at,
      t.current_route,
      t.module_key,
      (
        SELECT m.message_text
        FROM ai_assistant_messages m
        WHERE m.thread_id = e.thread_id
          AND m.role = 'user'
        ORDER BY m.created_at ASC
        LIMIT 1
      ) AS first_user_message
    FROM ai_support_escalations e
    LEFT JOIN ai_assistant_threads t ON t.id = e.thread_id
    WHERE ${whereClause}
    ORDER BY e.created_at DESC
    LIMIT ${limit}
  `);

  return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
    id: r['id'] as string,
    tenantId: r['tenant_id'] as string,
    threadId: r['thread_id'] as string,
    userId: r['user_id'] as string,
    summary: (r['summary'] as string | null) ?? null,
    reason: r['reason'] as string,
    status: r['status'] as string,
    priority: r['priority'] as string,
    assignedTo: (r['assigned_to'] as string | null) ?? null,
    firstUserMessage: (r['first_user_message'] as string | null) ?? null,
    currentRoute: (r['current_route'] as string | null) ?? null,
    moduleKey: (r['module_key'] as string | null) ?? null,
    createdAt: r['created_at'] as Date,
    updatedAt: r['updated_at'] as Date,
    resolvedAt: (r['resolved_at'] as Date | null) ?? null,
  }));
}

// ── Get Escalation Detail ────────────────────────────────────────────

export async function getEscalation(id: string): Promise<EscalationDetail | null> {
  const [escalation] = await db
    .select()
    .from(aiSupportEscalations)
    .where(eq(aiSupportEscalations.id, id))
    .limit(1);

  if (!escalation) return null;

  // All subsequent queries scoped to the escalation's tenantId (defense-in-depth)
  const tid = escalation.tenantId;

  const [thread] = await db
    .select()
    .from(aiAssistantThreads)
    .where(
      and(
        eq(aiAssistantThreads.id, escalation.threadId),
        eq(aiAssistantThreads.tenantId, tid),
      ),
    )
    .limit(1);

  if (!thread) return null;

  const messages = await db
    .select()
    .from(aiAssistantMessages)
    .where(
      and(
        eq(aiAssistantMessages.threadId, escalation.threadId),
        eq(aiAssistantMessages.tenantId, tid),
      ),
    )
    .orderBy(asc(aiAssistantMessages.createdAt));

  const contextSnapshots = await db
    .select()
    .from(aiAssistantContextSnapshots)
    .where(
      and(
        eq(aiAssistantContextSnapshots.threadId, escalation.threadId),
        eq(aiAssistantContextSnapshots.tenantId, tid),
      ),
    )
    .orderBy(asc(aiAssistantContextSnapshots.createdAt));

  return { escalation, thread, messages, contextSnapshots };
}
