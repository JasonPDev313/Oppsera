import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { withAdminDb } from '@/lib/admin-db';
import { sql } from '@oppsera/db';
import { CreateTestCaseSchema } from '@oppsera/module-ai-support';

// ── GET /api/v1/ai-support/test-cases ───────────────────────────────
// List all test cases

export const GET = withAdminPermission(async (_req: NextRequest) => {
  const rows = await withAdminDb(async (tx) =>
    tx.execute(sql`
      SELECT id, question, expected_answer_pattern, module_key, route,
             tags, enabled, created_at, updated_at
      FROM ai_support_test_cases
      ORDER BY created_at DESC
      LIMIT 500
    `),
  );

  const items = Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
    id: r['id'] as string,
    question: r['question'] as string,
    expectedAnswerPattern: r['expected_answer_pattern'] as string,
    moduleKey: (r['module_key'] as string | null) ?? null,
    route: (r['route'] as string | null) ?? null,
    tags: (r['tags'] as string[] | null) ?? [],
    enabled: r['enabled'] as string,
    createdAt: r['created_at'] instanceof Date
      ? r['created_at'].toISOString()
      : r['created_at'] ? String(r['created_at']) : null,
    updatedAt: r['updated_at'] instanceof Date
      ? r['updated_at'].toISOString()
      : r['updated_at'] ? String(r['updated_at']) : null,
  }));

  return NextResponse.json({ data: { items } });
}, { permission: 'ai_support.admin' });

// ── POST /api/v1/ai-support/test-cases ──────────────────────────────
// Create a test case

export const POST = withAdminPermission(async (req: NextRequest) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } },
      { status: 400 },
    );
  }

  const parsed = CreateTestCaseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Validation failed' } },
      { status: 400 },
    );
  }

  const { question, expectedAnswerPattern, moduleKey, route, tags } = parsed.data;
  const tagsJson = JSON.stringify(tags ?? []);

  const rows = await withAdminDb(async (tx) =>
    tx.execute(sql`
      INSERT INTO ai_support_test_cases
        (question, expected_answer_pattern, module_key, route, tags, enabled)
      VALUES
        (${question}, ${expectedAnswerPattern}, ${moduleKey ?? null}, ${route ?? null}, ${tagsJson}::jsonb, 'true')
      RETURNING id, question, expected_answer_pattern, module_key, route, tags, enabled, created_at, updated_at
    `),
  );

  const arr = Array.from(rows as Iterable<Record<string, unknown>>);
  const r = arr[0]!;

  return NextResponse.json({
    data: {
      id: r['id'] as string,
      question: r['question'] as string,
      expectedAnswerPattern: r['expected_answer_pattern'] as string,
      moduleKey: (r['module_key'] as string | null) ?? null,
      route: (r['route'] as string | null) ?? null,
      tags: (r['tags'] as string[] | null) ?? [],
      enabled: r['enabled'] as string,
      createdAt: r['created_at'] instanceof Date
        ? r['created_at'].toISOString()
        : r['created_at'] ? String(r['created_at']) : null,
      updatedAt: r['updated_at'] instanceof Date
        ? r['updated_at'].toISOString()
        : r['updated_at'] ? String(r['updated_at']) : null,
    },
  }, { status: 201 });
}, { permission: 'ai_support.admin' });
