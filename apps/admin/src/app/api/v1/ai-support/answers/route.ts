import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { withAdminDb } from '@/lib/admin-db';
import { sql } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';

const VALID_STATUSES = ['draft', 'active', 'stale', 'archived'];

// ── GET /api/v1/ai-support/answers ──────────────────────────────────
// List all answer cards with optional filters

export const GET = withAdminPermission(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  const status = sp.get('status') ?? null;
  const moduleKey = sp.get('moduleKey') ?? null;
  const rawLimit = Number(sp.get('limit') ?? 50);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;

  // Validate status filter if provided
  if (status && !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: `status must be one of: ${VALID_STATUSES.join(', ')}` } },
      { status: 400 },
    );
  }

  const conditions = [sql`1=1`];
  if (status) conditions.push(sql`status = ${status}`);
  if (moduleKey) conditions.push(sql`module_key = ${moduleKey}`);
  const whereClause = sql.join(conditions, sql` AND `);

  const rows = await withAdminDb(async (tx) =>
    tx.execute(sql`
      SELECT id, tenant_id, slug, module_key, route, question_pattern,
             approved_answer_markdown, version, status, owner_user_id, created_at, updated_at
      FROM ai_support_answer_cards
      WHERE ${whereClause}
      ORDER BY updated_at DESC
      LIMIT ${limit}
    `),
  );

  const ts = (v: unknown) => v instanceof Date ? v.toISOString() : v ? String(v) : null;

  const items = Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
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
  }));

  return NextResponse.json({ data: { items } });
}, { permission: 'ai_support.answers.read' });

// ── POST /api/v1/ai-support/answers ─────────────────────────────────
// Create a new answer card

const MAX_SLUG_LENGTH = 200;
const MAX_PATTERN_LENGTH = 2000;
const MAX_ANSWER_LENGTH = 50_000;

export const POST = withAdminPermission(async (req: NextRequest, session) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, { status: 400 });
  }

  const slug = (body.slug as string | undefined)?.trim();
  const questionPattern = (body.questionPattern as string | undefined)?.trim();
  const approvedAnswerMarkdown = (body.approvedAnswerMarkdown as string | undefined)?.trim();

  if (!slug || !questionPattern || !approvedAnswerMarkdown) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'slug, questionPattern, and approvedAnswerMarkdown are required' } },
      { status: 400 },
    );
  }

  if (slug.length > MAX_SLUG_LENGTH) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: `slug must be ${MAX_SLUG_LENGTH} characters or fewer` } },
      { status: 400 },
    );
  }
  if (questionPattern.length > MAX_PATTERN_LENGTH) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: `questionPattern must be ${MAX_PATTERN_LENGTH} characters or fewer` } },
      { status: 400 },
    );
  }
  if (approvedAnswerMarkdown.length > MAX_ANSWER_LENGTH) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: `approvedAnswerMarkdown must be ${MAX_ANSWER_LENGTH} characters or fewer` } },
      { status: 400 },
    );
  }

  const status = (body.status as string | undefined) ?? 'draft';
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: `status must be one of: ${VALID_STATUSES.join(', ')}` } },
      { status: 400 },
    );
  }

  const id = generateUlid();
  const tenantId = (body.tenantId as string | null) ?? null;
  const moduleKey = (body.moduleKey as string | null) ?? null;
  const route = (body.route as string | null) ?? null;
  const ownerUserId = (body.ownerUserId as string | null) ?? session.adminId;

  // Single transaction: slug uniqueness check + insert (no TOCTOU race)
  const result = await withAdminDb(async (tx) => {
    const existing = await tx.execute(
      sql`SELECT id FROM ai_support_answer_cards WHERE slug = ${slug} LIMIT 1`,
    );
    if (Array.from(existing as Iterable<unknown>).length > 0) {
      return { error: 'SLUG_CONFLICT' as const };
    }

    await tx.execute(sql`
      INSERT INTO ai_support_answer_cards
        (id, tenant_id, slug, module_key, route, question_pattern, approved_answer_markdown,
         version, status, owner_user_id, created_at, updated_at)
      VALUES
        (${id}, ${tenantId}, ${slug}, ${moduleKey}, ${route}, ${questionPattern},
         ${approvedAnswerMarkdown}, 1, ${status}, ${ownerUserId}, NOW(), NOW())
    `);

    return { ok: true as const };
  });

  if ('error' in result) {
    return NextResponse.json(
      { error: { code: 'CONFLICT', message: `Slug "${slug}" already exists` } },
      { status: 409 },
    );
  }

  return NextResponse.json(
    {
      data: {
        id,
        slug,
        moduleKey,
        route,
        questionPattern,
        status,
        version: 1,
      },
    },
    { status: 201 },
  );
}, { permission: 'ai_support.answers.write' });
