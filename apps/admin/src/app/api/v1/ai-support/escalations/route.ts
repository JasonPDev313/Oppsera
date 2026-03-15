import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { withAdminDb } from '@/lib/admin-db';
import { sql } from '@oppsera/db';

// ── GET /api/v1/ai-support/escalations ───────────────────────────────
// List escalations with filters and summary counts

export const GET = withAdminPermission(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  const status = sp.get('status') ?? null;
  const priority = sp.get('priority') ?? null;
  const tenantId = sp.get('tenantId') ?? null;
  const limit = Math.min(Number(sp.get('limit') ?? 100), 500);

  // ── Build WHERE clause ──
  const conditions = [sql`1=1`];
  if (status) conditions.push(sql`e.status = ${status}`);
  if (priority) conditions.push(sql`e.priority = ${priority}`);
  if (tenantId) conditions.push(sql`e.tenant_id = ${tenantId}`);
  const whereClause = sql.join(conditions, sql` AND `);

  const [rows, summaryRows] = await Promise.all([
    // ── Main list ──
    withAdminDb(async (tx) =>
      tx.execute(sql`
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
      `),
    ),

    // ── Summary stats (scoped to same filters) ──
    withAdminDb(async (tx) => {
      const sumConditions = [sql`1=1`];
      if (tenantId) sumConditions.push(sql`tenant_id = ${tenantId}`);
      const sumWhere = sql.join(sumConditions, sql` AND `);
      return tx.execute(sql`
        SELECT
          COUNT(*)::int                                                AS total,
          COUNT(*) FILTER (WHERE status = 'open')::int               AS open_count,
          COUNT(*) FILTER (WHERE status = 'assigned')::int           AS assigned_count,
          COUNT(*) FILTER (WHERE status = 'resolved')::int           AS resolved_count,
          COUNT(*) FILTER (WHERE status = 'closed')::int             AS closed_count,
          COUNT(*) FILTER (WHERE priority = 'critical')::int         AS critical_count,
          COUNT(*) FILTER (WHERE priority = 'high')::int             AS high_count,
          COUNT(*) FILTER (WHERE priority = 'medium')::int           AS medium_count,
          COUNT(*) FILTER (WHERE priority = 'low')::int              AS low_count,
          AVG(
            EXTRACT(EPOCH FROM (resolved_at - created_at)) / 60
          )::numeric(10,2)                                            AS avg_resolution_minutes,
          MAX(created_at)                                             AS latest_escalation_at
        FROM ai_support_escalations
        WHERE ${sumWhere}
      `);
    }),
  ]);

  const ts = (v: unknown) =>
    v instanceof Date ? v.toISOString() : v ? String(v) : null;

  const items = Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
    id: r['id'] as string,
    tenantId: r['tenant_id'] as string,
    threadId: r['thread_id'] as string,
    userId: r['user_id'] as string,
    summary: (r['summary'] as string | null) ?? null,
    reason: r['reason'] as string,
    status: r['status'] as string,
    priority: r['priority'] as string,
    assignedTo: (r['assigned_to'] as string | null) ?? null,
    resolutionNotes: (r['resolution_notes'] as string | null) ?? null,
    firstUserMessage: (r['first_user_message'] as string | null) ?? null,
    currentRoute: (r['current_route'] as string | null) ?? null,
    moduleKey: (r['module_key'] as string | null) ?? null,
    resolvedAt: ts(r['resolved_at']),
    createdAt: ts(r['created_at']),
    updatedAt: ts(r['updated_at']),
  }));

  // Parse summary
  const summaryList = Array.from(summaryRows as Iterable<Record<string, unknown>>);
  const s = summaryList[0] ?? {};

  const summary = {
    total: Number(s['total'] ?? 0),
    openCount: Number(s['open_count'] ?? 0),
    assignedCount: Number(s['assigned_count'] ?? 0),
    resolvedCount: Number(s['resolved_count'] ?? 0),
    closedCount: Number(s['closed_count'] ?? 0),
    criticalCount: Number(s['critical_count'] ?? 0),
    highCount: Number(s['high_count'] ?? 0),
    mediumCount: Number(s['medium_count'] ?? 0),
    lowCount: Number(s['low_count'] ?? 0),
    avgResolutionMinutes: s['avg_resolution_minutes'] ? Number(s['avg_resolution_minutes']) : null,
    latestEscalationAt: ts(s['latest_escalation_at']),
  };

  return NextResponse.json({ data: { items, summary } });
}, { permission: 'ai_support.admin' });
