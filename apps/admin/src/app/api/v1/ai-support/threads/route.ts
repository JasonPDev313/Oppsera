import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { withAdminDb } from '@/lib/admin-db';
import { sql } from '@oppsera/db';

export const GET = withAdminPermission(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  const tenantId = sp.get('tenantId') ?? '';
  const moduleKey = sp.get('moduleKey') ?? '';
  const status = sp.get('status') ?? '';
  const confidence = sp.get('confidence') ?? '';
  const rating = sp.get('rating') ?? '';
  const questionType = sp.get('questionType') ?? '';
  const issueTag = sp.get('issueTag') ?? '';
  const cursor = sp.get('cursor') ?? '';
  const limit = Math.min(Number(sp.get('limit') ?? 50), 100);

  const conditions = [sql`1=1`];
  if (tenantId) conditions.push(sql`t.id = ${tenantId}`);
  if (moduleKey) conditions.push(sql`th.module_key = ${moduleKey}`);
  if (status) conditions.push(sql`th.status = ${status}`);
  if (questionType) conditions.push(sql`th.question_type = ${questionType}`);
  if (issueTag) conditions.push(sql`th.issue_tag = ${issueTag}`);
  if (confidence) {
    conditions.push(sql`(
      SELECT m.answer_confidence
      FROM ai_assistant_messages m
      WHERE m.thread_id = th.id AND m.role = 'assistant'
      ORDER BY m.created_at DESC
      LIMIT 1
    ) = ${confidence}`);
  }
  if (rating) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM ai_assistant_feedback f
      JOIN ai_assistant_messages m ON m.id = f.message_id
      WHERE m.thread_id = th.id AND f.rating = ${rating}
    )`);
  }
  if (cursor) {
    conditions.push(sql`th.created_at < (SELECT created_at FROM ai_assistant_threads WHERE id = ${cursor})`);
  }
  const whereClause = sql.join(conditions, sql` AND `);

  const rows = await withAdminDb(async (tx) => {
    return tx.execute(sql`
      SELECT
        th.id,
        th.tenant_id,
        th.user_id,
        th.current_route,
        th.module_key,
        th.status,
        th.question_type,
        th.issue_tag,
        th.started_at,
        th.ended_at,
        th.created_at,
        t.name AS tenant_name,
        t.slug AS tenant_slug,
        (SELECT COUNT(*)::int FROM ai_assistant_messages m WHERE m.thread_id = th.id) AS message_count,
        (
          SELECT m.answer_confidence
          FROM ai_assistant_messages m
          WHERE m.thread_id = th.id AND m.role = 'assistant'
          ORDER BY m.created_at DESC
          LIMIT 1
        ) AS latest_confidence,
        (
          SELECT f.rating
          FROM ai_assistant_feedback f
          JOIN ai_assistant_messages m ON m.id = f.message_id
          WHERE m.thread_id = th.id
          ORDER BY f.created_at DESC
          LIMIT 1
        ) AS latest_rating,
        (
          SELECT m.message_text
          FROM ai_assistant_messages m
          WHERE m.thread_id = th.id AND m.role = 'user'
          ORDER BY m.created_at ASC
          LIMIT 1
        ) AS first_user_message
      FROM ai_assistant_threads th
      JOIN tenants t ON t.id = th.tenant_id
      WHERE ${whereClause}
      ORDER BY th.created_at DESC
      LIMIT ${limit + 1}
    `);
  });

  const items = Array.from(rows as Iterable<Record<string, unknown>>);
  const hasMore = items.length > limit;
  if (hasMore) items.pop();

  const ts = (v: unknown) => v instanceof Date ? v.toISOString() : v ? String(v) : null;

  const data = items.map((r) => ({
    id: r.id as string,
    tenantId: r.tenant_id as string,
    tenantName: r.tenant_name as string,
    tenantSlug: r.tenant_slug as string,
    userId: r.user_id as string,
    currentRoute: r.current_route as string | null,
    moduleKey: r.module_key as string | null,
    status: r.status as string,
    questionType: r.question_type as string | null,
    issueTag: r.issue_tag as string | null,
    messageCount: Number(r.message_count),
    latestConfidence: r.latest_confidence as string | null,
    latestRating: r.latest_rating as string | null,
    firstUserMessage: r.first_user_message as string | null,
    startedAt: ts(r.started_at),
    endedAt: ts(r.ended_at),
    createdAt: ts(r.created_at) ?? '',
  }));

  return NextResponse.json({
    data: {
      items: data,
      cursor: hasMore && data.length > 0 ? data[data.length - 1]!.id : null,
      hasMore,
    },
  });
}, { permission: 'ai_support.admin' });
