import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { withAdminDb } from '@/lib/admin-db';
import { sql } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';

// ── GET /api/v1/ai-support/reviews ──────────────────────────────────
// List review queue items — low confidence + thumbs-down messages

export const GET = withAdminPermission(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  const tenantId = sp.get('tenantId') ?? null;
  const limit = Math.min(Number(sp.get('limit') ?? 50), 200);

  const tenantFilter = tenantId
    ? sql`AND m.tenant_id = ${tenantId}`
    : sql``;

  const rows = await withAdminDb(async (tx) =>
    tx.execute(sql`
      SELECT
        m.id AS message_id,
        m.thread_id,
        m.tenant_id,
        m.message_text,
        m.answer_confidence,
        m.source_tier_used,
        m.created_at,
        f.rating AS feedback_rating,
        f.freeform_comment AS feedback_comment,
        r.review_status,
        r.corrected_answer
      FROM ai_assistant_messages m
      LEFT JOIN LATERAL (
        SELECT rating, freeform_comment
        FROM ai_assistant_feedback
        WHERE message_id = m.id
        LIMIT 1
      ) f ON true
      LEFT JOIN LATERAL (
        SELECT review_status, corrected_answer
        FROM ai_assistant_reviews
        WHERE message_id = m.id
        ORDER BY created_at DESC
        LIMIT 1
      ) r ON true
      WHERE m.role = 'assistant'
        AND (m.answer_confidence = 'low' OR f.rating = 'down')
        ${tenantFilter}
      ORDER BY m.created_at DESC
      LIMIT ${limit}
    `),
  );

  const items = Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
    messageId: r['message_id'] as string,
    threadId: r['thread_id'] as string,
    tenantId: r['tenant_id'] as string,
    messageText: r['message_text'] as string,
    answerConfidence: (r['answer_confidence'] as string | null) ?? null,
    sourceTierUsed: (r['source_tier_used'] as string | null) ?? null,
    createdAt: r['created_at'] instanceof Date ? r['created_at'].toISOString() : String(r['created_at']),
    feedbackRating: (r['feedback_rating'] as string | null) ?? null,
    feedbackComment: (r['feedback_comment'] as string | null) ?? null,
    reviewStatus: (r['review_status'] as string | null) ?? null,
    correctedAnswer: (r['corrected_answer'] as string | null) ?? null,
  }));

  return NextResponse.json({ data: { items } });
}, { permission: 'ai_support.reviews.read' });

// ── POST /api/v1/ai-support/reviews ─────────────────────────────────
// Submit a review action on an assistant message

export const POST = withAdminPermission(async (req: NextRequest, session) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, { status: 400 });
  }

  const messageId = (body.messageId as string | undefined)?.trim();
  const threadId = (body.threadId as string | undefined)?.trim();
  const reviewStatus = (body.reviewStatus as string | undefined)?.trim();

  if (!messageId || !threadId || !reviewStatus) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'messageId, threadId, and reviewStatus are required' } },
      { status: 400 },
    );
  }

  const validStatuses = ['approved', 'edited', 'rejected', 'needs_kb_update'];
  if (!validStatuses.includes(reviewStatus)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: `reviewStatus must be one of: ${validStatuses.join(', ')}` } },
      { status: 400 },
    );
  }

  if (reviewStatus === 'edited' && !body.correctedAnswer) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'correctedAnswer is required for edited status' } },
      { status: 400 },
    );
  }

  // Fetch the message
  const msgRows = await withAdminDb(async (tx) =>
    tx.execute(sql`
      SELECT id, tenant_id, role, message_text, source_tier_used
      FROM ai_assistant_messages
      WHERE id = ${messageId}
      LIMIT 1
    `),
  );
  const msgArr = Array.from(msgRows as Iterable<Record<string, unknown>>);
  if (msgArr.length === 0) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: `Message ${messageId} not found` } },
      { status: 404 },
    );
  }
  const msg = msgArr[0]!;
  if (msg['role'] !== 'assistant') {
    return NextResponse.json(
      { error: { code: 'INVALID_ROLE', message: 'Only assistant messages can be reviewed' } },
      { status: 400 },
    );
  }

  const tenantId = msg['tenant_id'] as string;
  const reviewId = generateUlid();
  const reviewNotes = (body.reviewNotes as string | null) ?? null;
  const correctedAnswer = (body.correctedAnswer as string | null) ?? null;

  // Insert review
  await withAdminDb(async (tx) =>
    tx.execute(sql`
      INSERT INTO ai_assistant_reviews
        (id, tenant_id, thread_id, message_id, reviewer_user_id, review_status, review_notes, corrected_answer, created_at)
      VALUES
        (${reviewId}, ${tenantId}, ${threadId}, ${messageId}, ${session.adminId},
         ${reviewStatus}, ${reviewNotes}, ${correctedAnswer}, NOW())
    `),
  );

  // Promote to answer memory for approved/edited
  if (
    (reviewStatus === 'approved' || reviewStatus === 'edited') &&
    body.questionNormalized
  ) {
    const questionNormalized = body.questionNormalized as string;
    const screenKey = (body.screenKey as string | null) ?? null;
    const moduleKey = (body.moduleKey as string | null) ?? null;
    const answerText =
      reviewStatus === 'edited'
        ? correctedAnswer ?? ''
        : (msg['message_text'] as string);
    const sourceTier =
      reviewStatus === 'edited'
        ? 'answer_card'
        : ((msg['source_tier_used'] as string | null) ?? null);

    const existingMemory = await withAdminDb(async (tx) =>
      tx.execute(sql`
        SELECT id FROM ai_assistant_answer_memory
        WHERE question_normalized = ${questionNormalized}
          AND tenant_id = ${tenantId}
        LIMIT 1
      `),
    );
    const existingArr = Array.from(existingMemory as Iterable<Record<string, unknown>>);

    if (existingArr.length > 0) {
      const existingId = existingArr[0]!['id'] as string;
      await withAdminDb(async (tx) =>
        tx.execute(sql`
          UPDATE ai_assistant_answer_memory
          SET answer_markdown = ${answerText},
              screen_key = ${screenKey},
              module_key = ${moduleKey},
              source_tier_used = ${sourceTier},
              review_status = 'approved',
              approved_by = ${session.adminId},
              approved_at = NOW(),
              updated_at = NOW()
          WHERE id = ${existingId}
        `),
      );
    } else {
      const memoryId = generateUlid();
      await withAdminDb(async (tx) =>
        tx.execute(sql`
          INSERT INTO ai_assistant_answer_memory
            (id, tenant_id, question_normalized, screen_key, module_key, tenant_scope,
             answer_markdown, source_tier_used, review_status, approved_by, approved_at, created_at, updated_at)
          VALUES
            (${memoryId}, ${tenantId}, ${questionNormalized}, ${screenKey}, ${moduleKey}, 'global',
             ${answerText}, ${sourceTier}, 'approved', ${session.adminId}, NOW(), NOW(), NOW())
        `),
      );
    }
  }

  return NextResponse.json({ data: { id: reviewId, reviewStatus } }, { status: 201 });
}, { permission: 'ai_support.reviews.write' });
