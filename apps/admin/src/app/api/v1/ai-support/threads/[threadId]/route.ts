import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { withAdminDb } from '@/lib/admin-db';
import { sql } from '@oppsera/db';

export const GET = withAdminPermission(async (_req: NextRequest, _session, params) => {
  const threadId = params?.threadId;
  if (!threadId) {
    return NextResponse.json({ error: { message: 'Thread ID required' } }, { status: 400 });
  }

  const threadRows = await withAdminDb(async (tx) => {
    return tx.execute(sql`
      SELECT
        th.id,
        th.tenant_id,
        th.user_id,
        th.session_id,
        th.channel,
        th.current_route,
        th.module_key,
        th.status,
        th.question_type,
        th.outcome,
        th.issue_tag,
        th.started_at,
        th.ended_at,
        th.created_at,
        th.updated_at,
        t.name AS tenant_name,
        t.slug AS tenant_slug
      FROM ai_assistant_threads th
      JOIN tenants t ON t.id = th.tenant_id
      WHERE th.id = ${threadId}
      LIMIT 1
    `);
  });

  const threads = Array.from(threadRows as Iterable<Record<string, unknown>>);
  if (threads.length === 0) {
    return NextResponse.json({ error: { message: 'Thread not found' } }, { status: 404 });
  }
  const thread = threads[0]!;

  const [messageRows, snapshotRows] = await Promise.all([
    withAdminDb(async (tx) => {
      return tx.execute(sql`
        SELECT
          m.id,
          m.role,
          m.message_text,
          m.model_name,
          m.prompt_version,
          m.answer_confidence,
          m.source_tier_used,
          m.citations_json,
          m.feedback_status,
          m.created_at,
          f.rating AS feedback_rating,
          f.reason_code AS feedback_reason_code,
          f.freeform_comment AS feedback_comment
        FROM ai_assistant_messages m
        LEFT JOIN ai_assistant_feedback f ON f.message_id = m.id
        WHERE m.thread_id = ${threadId}
        ORDER BY m.created_at ASC
      `);
    }),
    withAdminDb(async (tx) => {
      return tx.execute(sql`
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
        WHERE cs.thread_id = ${threadId}
        ORDER BY cs.created_at ASC
      `);
    }),
  ]);

  const messages = Array.from(messageRows as Iterable<Record<string, unknown>>);
  const snapshots = Array.from(snapshotRows as Iterable<Record<string, unknown>>);

  const ts = (v: unknown) => v instanceof Date ? v.toISOString() : v ? String(v) : null;

  return NextResponse.json({
    data: {
      thread: {
        id: thread.id as string,
        tenantId: thread.tenant_id as string,
        tenantName: thread.tenant_name as string,
        tenantSlug: thread.tenant_slug as string,
        userId: thread.user_id as string,
        sessionId: thread.session_id as string | null,
        channel: thread.channel as string,
        currentRoute: thread.current_route as string | null,
        moduleKey: thread.module_key as string | null,
        status: thread.status as string,
        questionType: thread.question_type as string | null,
        outcome: thread.outcome as string | null,
        issueTag: thread.issue_tag as string | null,
        startedAt: ts(thread.started_at),
        endedAt: ts(thread.ended_at),
        createdAt: ts(thread.created_at) ?? '',
        updatedAt: ts(thread.updated_at) ?? '',
      },
      messages: messages.map((m) => ({
        id: m.id as string,
        role: m.role as string,
        messageText: m.message_text as string,
        modelName: m.model_name as string | null,
        promptVersion: m.prompt_version as string | null,
        answerConfidence: m.answer_confidence as string | null,
        sourceTierUsed: m.source_tier_used as string | null,
        citationsJson: m.citations_json ?? null,
        feedbackStatus: m.feedback_status as string | null,
        feedbackRating: m.feedback_rating as string | null,
        feedbackReasonCode: m.feedback_reason_code as string | null,
        feedbackComment: m.feedback_comment as string | null,
        createdAt: ts(m.created_at) ?? '',
      })),
      contextSnapshots: snapshots.map((cs) => ({
        id: cs.id as string,
        messageId: cs.message_id as string,
        route: cs.route as string | null,
        screenTitle: cs.screen_title as string | null,
        moduleKey: cs.module_key as string | null,
        roleKeysJson: cs.role_keys_json ?? null,
        featureFlagsJson: cs.feature_flags_json ?? null,
        enabledModulesJson: cs.enabled_modules_json ?? null,
        visibleActionsJson: cs.visible_actions_json ?? null,
        uiStateJson: cs.ui_state_json ?? null,
        tenantSettingsJson: cs.tenant_settings_json ?? null,
        createdAt: ts(cs.created_at) ?? '',
      })),
    },
  });
}, { permission: 'ai_support.admin' });
