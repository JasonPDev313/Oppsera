import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { withAdminDb } from '@/lib/admin-db';
import { sql } from '@oppsera/db';
import { UpdateTestCaseSchema } from '@oppsera/module-ai-support';

// ── PATCH /api/v1/ai-support/test-cases/[id] ────────────────────────
// Update a test case

export const PATCH = withAdminPermission(async (req: NextRequest, _session, params) => {
  const id = params?.id;
  if (!id) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'Missing id' } },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } },
      { status: 400 },
    );
  }

  const parsed = UpdateTestCaseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Validation failed' } },
      { status: 400 },
    );
  }

  // Verify exists
  const existing = await withAdminDb(async (tx) =>
    tx.execute(sql`SELECT id FROM ai_support_test_cases WHERE id = ${id} LIMIT 1`),
  );
  if (Array.from(existing as Iterable<unknown>).length === 0) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: `Test case ${id} not found` } },
      { status: 404 },
    );
  }

  const data = parsed.data;
  const setParts: ReturnType<typeof sql>[] = [sql`updated_at = NOW()`];

  if (data.question !== undefined) setParts.push(sql`question = ${data.question}`);
  if (data.expectedAnswerPattern !== undefined) setParts.push(sql`expected_answer_pattern = ${data.expectedAnswerPattern}`);
  if (data.moduleKey !== undefined) setParts.push(sql`module_key = ${data.moduleKey ?? null}`);
  if (data.route !== undefined) setParts.push(sql`route = ${data.route ?? null}`);
  if (data.tags !== undefined) setParts.push(sql`tags = ${JSON.stringify(data.tags)}::jsonb`);
  if (data.enabled !== undefined) setParts.push(sql`enabled = ${data.enabled ? 'true' : 'false'}`);

  await withAdminDb(async (tx) =>
    tx.execute(sql`
      UPDATE ai_support_test_cases
      SET ${sql.join(setParts, sql`, `)}
      WHERE id = ${id}
    `),
  );

  return NextResponse.json({ data: { id, updated: true } });
}, { permission: 'ai_support.admin' });

// ── DELETE /api/v1/ai-support/test-cases/[id] ────────────────────────
// Hard-delete a test case

export const DELETE = withAdminPermission(async (_req: NextRequest, _session, params) => {
  const id = params?.id;
  if (!id) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'Missing id' } },
      { status: 400 },
    );
  }

  const existing = await withAdminDb(async (tx) =>
    tx.execute(sql`SELECT id FROM ai_support_test_cases WHERE id = ${id} LIMIT 1`),
  );
  if (Array.from(existing as Iterable<unknown>).length === 0) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: `Test case ${id} not found` } },
      { status: 404 },
    );
  }

  await withAdminDb(async (tx) =>
    tx.execute(sql`DELETE FROM ai_support_test_cases WHERE id = ${id}`),
  );

  return NextResponse.json({ data: { id, deleted: true } });
}, { permission: 'ai_support.admin' });
