import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { withAdminDb } from '@/lib/admin-db';
import { sql } from '@oppsera/db';

// ── GET /api/v1/ai-support/test-runs/[id] ───────────────────────────
// Get a test run with its individual results

export const GET = withAdminPermission(async (_req: NextRequest, _session, params) => {
  const id = params?.id;
  if (!id) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'Missing id' } },
      { status: 400 },
    );
  }

  const ts = (v: unknown) =>
    v instanceof Date ? v.toISOString() : v ? String(v) : null;

  // Load the run
  const runRows = await withAdminDb(async (tx) =>
    tx.execute(sql`
      SELECT id, name, status, total_cases, passed, failed, regressed,
             started_at, completed_at, created_at
      FROM ai_support_test_runs
      WHERE id = ${id}
      LIMIT 1
    `),
  );

  const runArr = Array.from(runRows as Iterable<Record<string, unknown>>);
  if (runArr.length === 0) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: `Test run ${id} not found` } },
      { status: 404 },
    );
  }

  const run = runArr[0]!;

  // Load results with test case details
  const resultRows = await withAdminDb(async (tx) =>
    tx.execute(sql`
      SELECT
        tr.id,
        tr.test_case_id,
        tc.question,
        tc.expected_answer_pattern,
        tc.module_key,
        tc.tags,
        tr.actual_answer,
        tr.confidence,
        tr.source_tier,
        tr.passed,
        tr.regression,
        tr.score,
        tr.duration_ms,
        tr.created_at
      FROM ai_support_test_results tr
      JOIN ai_support_test_cases tc ON tc.id = tr.test_case_id
      WHERE tr.run_id = ${id}
      ORDER BY tr.created_at ASC
    `),
  );

  const results = Array.from(resultRows as Iterable<Record<string, unknown>>).map((r) => ({
    id: r['id'] as string,
    testCaseId: r['test_case_id'] as string,
    question: r['question'] as string,
    expectedAnswerPattern: r['expected_answer_pattern'] as string,
    moduleKey: (r['module_key'] as string | null) ?? null,
    tags: (r['tags'] as string[] | null) ?? [],
    actualAnswer: (r['actual_answer'] as string | null) ?? null,
    confidence: (r['confidence'] as string | null) ?? null,
    sourceTier: (r['source_tier'] as string | null) ?? null,
    passed: r['passed'] as string,
    regression: r['regression'] as string,
    score: r['score'] as string,
    durationMs: r['duration_ms'] != null ? Number(r['duration_ms']) : null,
    createdAt: ts(r['created_at']),
  }));

  return NextResponse.json({
    data: {
      run: {
        id: run['id'] as string,
        name: run['name'] as string,
        status: run['status'] as string,
        totalCases: Number(run['total_cases'] ?? 0),
        passed: Number(run['passed'] ?? 0),
        failed: Number(run['failed'] ?? 0),
        regressed: Number(run['regressed'] ?? 0),
        startedAt: ts(run['started_at']),
        completedAt: ts(run['completed_at']),
        createdAt: ts(run['created_at']),
      },
      results,
    },
  });
}, { permission: 'ai_support.admin' });
