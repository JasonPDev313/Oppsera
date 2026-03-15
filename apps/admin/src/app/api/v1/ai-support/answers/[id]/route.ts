import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { withAdminDb } from '@/lib/admin-db';
import { sql } from '@oppsera/db';

// ULID: 26 chars, Crockford base32
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

// ── GET /api/v1/ai-support/answers/[id] ─────────────────────────────
// Fetch a single answer card by ID

export const GET = withAdminPermission(async (_req: NextRequest, _session, params) => {
  const id = params?.id;
  if (!id || !ULID_RE.test(id)) {
    return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Missing or invalid id' } }, { status: 400 });
  }

  const rows = await withAdminDb(async (tx) =>
    tx.execute(sql`
      SELECT id, tenant_id, slug, module_key, route, question_pattern,
             approved_answer_markdown, version, status, owner_user_id, created_at, updated_at
      FROM ai_support_answer_cards
      WHERE id = ${id}
      LIMIT 1
    `),
  );

  const arr = Array.from(rows as Iterable<Record<string, unknown>>);
  if (arr.length === 0) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: `Answer card ${id} not found` } }, { status: 404 });
  }

  const r = arr[0]!;
  const ts = (v: unknown) => v instanceof Date ? v.toISOString() : v ? String(v) : null;

  return NextResponse.json({
    data: {
      id: r['id'] as string,
      tenantId: (r['tenant_id'] as string | null) ?? null,
      slug: r['slug'] as string,
      moduleKey: (r['module_key'] as string | null) ?? null,
      route: (r['route'] as string | null) ?? null,
      questionPattern: r['question_pattern'] as string,
      approvedAnswerMarkdown: r['approved_answer_markdown'] as string,
      version: Number(r['version']),
      status: r['status'] as string,
      ownerUserId: (r['owner_user_id'] as string | null) ?? null,
      createdAt: ts(r['created_at']),
      updatedAt: ts(r['updated_at']),
    },
  });
}, { permission: 'ai_support.answers.read' });

// ── PATCH /api/v1/ai-support/answers/[id] ───────────────────────────
// Update an answer card

export const PATCH = withAdminPermission(async (req: NextRequest, _session, params) => {
  const id = params?.id;
  if (!id || !ULID_RE.test(id)) {
    return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Missing or invalid id' } }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, { status: 400 });
  }

  // Extract and validate fields before touching the DB
  const newSlug = (body.slug as string | undefined)?.trim() ?? null;
  const newModuleKey = Object.prototype.hasOwnProperty.call(body, 'moduleKey')
    ? ((body.moduleKey as string | null) ?? null)
    : undefined;
  const newRoute = Object.prototype.hasOwnProperty.call(body, 'route')
    ? ((body.route as string | null) ?? null)
    : undefined;
  const newQuestionPattern = (body.questionPattern as string | undefined)?.trim() ?? null;
  const newAnswer = (body.approvedAnswerMarkdown as string | undefined)?.trim() ?? null;
  const newStatus = (body.status as string | undefined) ?? null;
  const newOwner = Object.prototype.hasOwnProperty.call(body, 'ownerUserId')
    ? ((body.ownerUserId as string | null) ?? null)
    : undefined;

  const validStatuses = ['draft', 'active', 'stale', 'archived'];
  if (newStatus && !validStatuses.includes(newStatus)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: `status must be one of: ${validStatuses.join(', ')}` } },
      { status: 400 },
    );
  }

  // Single transaction: existence check + slug uniqueness + update (no TOCTOU race)
  const result = await withAdminDb(async (tx) => {
    // Verify card exists
    const existing = await tx.execute(sql`
      SELECT id, approved_answer_markdown, version
      FROM ai_support_answer_cards WHERE id = ${id} LIMIT 1
    `);
    const existingArr = Array.from(existing as Iterable<Record<string, unknown>>);
    if (existingArr.length === 0) {
      return { error: 'NOT_FOUND' as const };
    }

    const current = existingArr[0]!;
    const currentVersion = Number(current['version']);
    const currentAnswer = current['approved_answer_markdown'] as string;

    // Check slug uniqueness within the same transaction
    if (newSlug) {
      const slugConflict = await tx.execute(sql`
        SELECT id FROM ai_support_answer_cards WHERE slug = ${newSlug} AND id != ${id} LIMIT 1
      `);
      if (Array.from(slugConflict as Iterable<unknown>).length > 0) {
        return { error: 'SLUG_CONFLICT' as const, slug: newSlug };
      }
    }

    // Bump version if answer content changed
    const answerChanged = newAnswer !== null && newAnswer !== currentAnswer;
    const nextVersion = answerChanged ? currentVersion + 1 : currentVersion;

    const setParts: ReturnType<typeof sql>[] = [sql`updated_at = NOW()`];
    if (newSlug) setParts.push(sql`slug = ${newSlug}`);
    if (newModuleKey !== undefined) setParts.push(sql`module_key = ${newModuleKey}`);
    if (newRoute !== undefined) setParts.push(sql`route = ${newRoute}`);
    if (newQuestionPattern) setParts.push(sql`question_pattern = ${newQuestionPattern}`);
    if (newAnswer) setParts.push(sql`approved_answer_markdown = ${newAnswer}`);
    if (newStatus) setParts.push(sql`status = ${newStatus}`);
    if (newOwner !== undefined) setParts.push(sql`owner_user_id = ${newOwner}`);
    if (answerChanged) setParts.push(sql`version = ${nextVersion}`);

    await tx.execute(sql`
      UPDATE ai_support_answer_cards
      SET ${sql.join(setParts, sql`, `)}
      WHERE id = ${id}
    `);

    return { ok: true as const, id, version: nextVersion };
  });

  if ('error' in result) {
    if (result.error === 'NOT_FOUND') {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Answer card ${id} not found` } },
        { status: 404 },
      );
    }
    if (result.error === 'SLUG_CONFLICT') {
      return NextResponse.json(
        { error: { code: 'CONFLICT', message: `Slug '${result.slug}' is already in use` } },
        { status: 409 },
      );
    }
  }

  return NextResponse.json({
    data: { id: result.id, version: result.version, updated: true },
  });
}, { permission: 'ai_support.answers.write' });
