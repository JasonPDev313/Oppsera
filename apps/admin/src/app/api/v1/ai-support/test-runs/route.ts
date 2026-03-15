import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { withAdminDb } from '@/lib/admin-db';
import { sql } from '@oppsera/db';
import { createTestRun, runTestSuite } from '@oppsera/module-ai-support';

// Vercel max function duration — 5 minutes for full test suite execution
export const maxDuration = 300;

// ── GET /api/v1/ai-support/test-runs ────────────────────────────────
// List test runs

export const GET = withAdminPermission(async (_req: NextRequest) => {
  const rows = await withAdminDb(async (tx) =>
    tx.execute(sql`
      SELECT id, name, status, total_cases, passed, failed, regressed,
             started_at, completed_at, created_at
      FROM ai_support_test_runs
      ORDER BY created_at DESC
      LIMIT 100
    `),
  );

  const ts = (v: unknown) =>
    v instanceof Date ? v.toISOString() : v ? String(v) : null;

  const items = Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
    id: r['id'] as string,
    name: r['name'] as string,
    status: r['status'] as string,
    totalCases: Number(r['total_cases'] ?? 0),
    passed: Number(r['passed'] ?? 0),
    failed: Number(r['failed'] ?? 0),
    regressed: Number(r['regressed'] ?? 0),
    startedAt: ts(r['started_at']),
    completedAt: ts(r['completed_at']),
    createdAt: ts(r['created_at']),
  }));

  return NextResponse.json({ data: { items } });
}, { permission: 'ai_support.admin' });

// ── POST /api/v1/ai-support/test-runs ───────────────────────────────
// Create and execute a new test run

export const POST = withAdminPermission(async (req: NextRequest) => {
  let body: { name?: string; testCaseIds?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    // Use defaults if no body
  }

  const name = typeof body.name === 'string' && body.name.trim()
    ? body.name.trim()
    : `Test Run ${new Date().toISOString()}`;

  const testCaseIds = Array.isArray(body.testCaseIds) ? body.testCaseIds : undefined;

  const runId = await createTestRun(name);
  const results = await runTestSuite(runId, testCaseIds);

  return NextResponse.json({ data: { runId, results } }, { status: 201 });
}, { permission: 'ai_support.admin' });
