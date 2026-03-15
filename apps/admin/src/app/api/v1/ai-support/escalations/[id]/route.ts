import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { withAdminDb } from '@/lib/admin-db';
import { sql } from '@oppsera/db';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

// ── GET /api/v1/ai-support/escalations/:id ───────────────────────────
// Get escalation detail with thread messages and context snapshots

export const GET = withAdminPermission(async (req: NextRequest) => {
  const id = extractId(req);

  const [escalationRows, messageRows, snapshotRows] = await Promise.all([
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
          t.status         AS thread_status,
          t.question_type,
          t.outcome,
          t.issue_tag,
          t.started_at,
          t.ended_at,
          t.created_at     AS thread_created_at
        FROM ai_support_escalations e
        LEFT JOIN ai_assistant_threads t ON t.id = e.thread_id
        WHERE e.id = ${id}
        LIMIT 1
      `),
    ),

    withAdminDb(async (tx) =>
      tx.execute(sql`
        SELECT
          m.id,
          m.role,
          m.message_text,
          m.model_name,
          m.answer_confidence,
          m.source_tier_used,
          m.citations_json,
          m.feedback_status,
          m.created_at
        FROM ai_assistant_messages m
        JOIN ai_support_escalations e ON e.thread_id = m.thread_id
        WHERE e.id = ${id}
        ORDER BY m.created_at ASC
      `),
    ),

    withAdminDb(async (tx) =>
      tx.execute(sql`
        SELECT
          cs.id,
          cs.message_id,
          cs.route,
          cs.screen_title,
          cs.module_key,
          cs.role_keys_json,
          cs.feature_flags_json,
          cs.enabled_modules_json,
          cs.visible_actions_json,
          cs.ui_state_json,
          cs.tenant_settings_json,
          cs.created_at
        FROM ai_assistant_context_snapshots cs
        JOIN ai_support_escalations e ON e.thread_id = cs.thread_id
        WHERE e.id = ${id}
        ORDER BY cs.created_at ASC
      `),
    ),
  ]);

  const escalationList = Array.from(escalationRows as Iterable<Record<string, unknown>>);
  if (escalationList.length === 0) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Escalation not found' } },
      { status: 404 },
    );
  }

  const ts = (v: unknown) =>
    v instanceof Date ? v.toISOString() : v ? String(v) : null;

  const e = escalationList[0]!;

  const escalation = {
    id: e['id'] as string,
    tenantId: e['tenant_id'] as string,
    threadId: e['thread_id'] as string,
    userId: e['user_id'] as string,
    summary: (e['summary'] as string | null) ?? null,
    reason: e['reason'] as string,
    status: e['status'] as string,
    priority: e['priority'] as string,
    assignedTo: (e['assigned_to'] as string | null) ?? null,
    resolutionNotes: (e['resolution_notes'] as string | null) ?? null,
    resolvedAt: ts(e['resolved_at']),
    createdAt: ts(e['created_at']),
    updatedAt: ts(e['updated_at']),
  };

  const thread = {
    id: e['thread_id'] as string,
    currentRoute: (e['current_route'] as string | null) ?? null,
    moduleKey: (e['module_key'] as string | null) ?? null,
    status: (e['thread_status'] as string | null) ?? null,
    questionType: (e['question_type'] as string | null) ?? null,
    outcome: (e['outcome'] as string | null) ?? null,
    issueTag: (e['issue_tag'] as string | null) ?? null,
    startedAt: ts(e['started_at']),
    endedAt: ts(e['ended_at']),
    createdAt: ts(e['thread_created_at']),
  };

  const messages = Array.from(messageRows as Iterable<Record<string, unknown>>).map((m) => ({
    id: m['id'] as string,
    role: m['role'] as string,
    messageText: m['message_text'] as string,
    modelName: (m['model_name'] as string | null) ?? null,
    answerConfidence: (m['answer_confidence'] as string | null) ?? null,
    sourceTierUsed: (m['source_tier_used'] as string | null) ?? null,
    citationsJson: (m['citations_json'] as unknown) ?? null,
    feedbackStatus: (m['feedback_status'] as string | null) ?? null,
    createdAt: ts(m['created_at']),
  }));

  const contextSnapshots = Array.from(snapshotRows as Iterable<Record<string, unknown>>).map((cs) => ({
    id: cs['id'] as string,
    messageId: cs['message_id'] as string,
    route: (cs['route'] as string | null) ?? null,
    screenTitle: (cs['screen_title'] as string | null) ?? null,
    moduleKey: (cs['module_key'] as string | null) ?? null,
    roleKeysJson: (cs['role_keys_json'] as unknown) ?? null,
    featureFlagsJson: (cs['feature_flags_json'] as unknown) ?? null,
    enabledModulesJson: (cs['enabled_modules_json'] as unknown) ?? null,
    visibleActionsJson: (cs['visible_actions_json'] as unknown) ?? null,
    uiStateJson: (cs['ui_state_json'] as unknown) ?? null,
    tenantSettingsJson: (cs['tenant_settings_json'] as unknown) ?? null,
    createdAt: ts(cs['created_at']),
  }));

  return NextResponse.json({ data: { escalation, thread, messages, contextSnapshots } });
}, { permission: 'ai_support.admin' });

// ── PATCH /api/v1/ai-support/escalations/:id ─────────────────────────
// Assign or resolve an escalation

export const PATCH = withAdminPermission(async (req: NextRequest, session) => {
  const id = extractId(req);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } },
      { status: 400 },
    );
  }

  const validStatuses = ['open', 'assigned', 'resolved', 'closed'];
  const validPriorities = ['low', 'medium', 'high', 'critical'];

  const status = body['status'] as string | undefined;
  const priority = body['priority'] as string | undefined;
  const assignedTo = body['assignedTo'] as string | undefined;
  const resolutionNotes = body['resolutionNotes'] as string | undefined;

  if (status && !validStatuses.includes(status)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: `status must be one of: ${validStatuses.join(', ')}` } },
      { status: 400 },
    );
  }

  if (priority && !validPriorities.includes(priority)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: `priority must be one of: ${validPriorities.join(', ')}` } },
      { status: 400 },
    );
  }

  const resolvedAtClause =
    status === 'resolved'
      ? sql`, resolved_at = NOW()`
      : sql``;

  const result = await withAdminDb(async (tx) =>
    tx.execute(sql`
      UPDATE ai_support_escalations SET
        status            = COALESCE(${status ?? null}, status),
        priority          = COALESCE(${priority ?? null}, priority),
        assigned_to       = COALESCE(${assignedTo ?? null}, assigned_to),
        resolution_notes  = COALESCE(${resolutionNotes ?? null}, resolution_notes),
        updated_at        = NOW()
        ${resolvedAtClause}
      WHERE id = ${id}
      RETURNING id, status, priority, assigned_to, resolved_at, updated_at
    `),
  );

  const rows = Array.from(result as Iterable<Record<string, unknown>>);
  if (rows.length === 0) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Escalation not found' } },
      { status: 404 },
    );
  }

  const ts = (v: unknown) =>
    v instanceof Date ? v.toISOString() : v ? String(v) : null;

  const updated = rows[0]!;
  return NextResponse.json({
    data: {
      id: updated['id'] as string,
      status: updated['status'] as string,
      priority: updated['priority'] as string,
      assignedTo: (updated['assigned_to'] as string | null) ?? null,
      resolvedAt: ts(updated['resolved_at']),
      updatedAt: ts(updated['updated_at']),
      updatedBy: session.adminId,
    },
  });
}, { permission: 'ai_support.admin' });
