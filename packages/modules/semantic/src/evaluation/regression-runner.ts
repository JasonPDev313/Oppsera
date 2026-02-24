import { db } from '@oppsera/db';
import {
  semanticEvalRegressionRuns,
  semanticEvalRegressionResults,
  semanticEvalExamples,
} from '@oppsera/db';
import { sql, eq, and, desc } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import type { ExampleCategory } from './types';

// ── Pipeline interface ──────────────────────────────────────────
// Avoids circular dependency with the LLM pipeline module.
// Wire via singleton setter from the app layer (same pattern as getExampleManager).

export interface RegressionPipelineResult {
  plan: Record<string, unknown> | null;
  sql: string | null;
  executionTimeMs: number;
  rowCount: number;
  error?: string;
  costUsd?: number;
}

export interface RegressionPipelineInterface {
  runForRegression(
    question: string,
    tenantId?: string,
  ): Promise<RegressionPipelineResult>;
}

// ── Singleton getter/setter ─────────────────────────────────────

let _regressionPipeline: RegressionPipelineInterface | null = null;

export function getRegressionPipeline(): RegressionPipelineInterface {
  if (!_regressionPipeline) {
    throw new Error(
      'RegressionPipeline not initialized. Call setRegressionPipeline() first.',
    );
  }
  return _regressionPipeline;
}

export function setRegressionPipeline(pipeline: RegressionPipelineInterface): void {
  _regressionPipeline = pipeline;
}

// ── Types ───────────────────────────────────────────────────────

export interface StartRegressionRunInput {
  name?: string;
  categoryFilter?: ExampleCategory;
  triggerType?: 'manual' | 'scheduled' | 'pre_deploy';
}

export interface RegressionResult {
  id: string;
  runId: string;
  exampleId: string;
  status: 'pending' | 'passed' | 'failed' | 'errored';
  expectedPlan: Record<string, unknown> | null;
  actualPlan: Record<string, unknown> | null;
  planMatch: boolean | null;
  expectedSql: string | null;
  actualSql: string | null;
  sqlMatch: boolean | null;
  executionTimeMs: number | null;
  rowCount: number | null;
  executionError: string | null;
  costUsd: number | null;
  diffSummary: string | null;
  createdAt: string;
}

export interface RegressionRun {
  id: string;
  name: string | null;
  status: string;
  triggerType: string;
  exampleCount: number;
  categoryFilter: string | null;
  totalExamples: number;
  passed: number;
  failed: number;
  errored: number;
  passRate: number | null;
  avgLatencyMs: number | null;
  totalCostUsd: number | null;
  modelConfig: Record<string, unknown> | null;
  promptSnapshot: string | null;
  createdBy: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface RegressionRunWithResults {
  run: RegressionRun;
  results: RegressionResult[];
}

export interface ListRegressionRunsFilters {
  status?: string;
  cursor?: string;
  limit?: number;
}

export interface ListRegressionRunsResult {
  runs: RegressionRun[];
  cursor: string | null;
  hasMore: boolean;
}

export interface RegressionTrendPoint {
  date: string;
  passRate: number;
  totalExamples: number;
}

export interface PlanComparison {
  match: boolean;
  diffSummary: string;
}

// ── comparePlans ────────────────────────────────────────────────
// Pure function comparing two plans. Normalizes both (sort keys
// recursively), then diffs.

export function comparePlans(
  expected: Record<string, unknown> | null,
  actual: Record<string, unknown> | null,
): PlanComparison {
  if (expected === null && actual === null) {
    return { match: true, diffSummary: 'Both plans are null' };
  }
  if (expected === null || actual === null) {
    return {
      match: false,
      diffSummary: expected === null
        ? 'Expected plan is null but actual plan is present'
        : 'Expected plan is present but actual plan is null',
    };
  }

  const normalizedExpected = normalizeForComparison(expected);
  const normalizedActual = normalizeForComparison(actual);

  const expectedJson = JSON.stringify(normalizedExpected);
  const actualJson = JSON.stringify(normalizedActual);

  if (expectedJson === actualJson) {
    return { match: true, diffSummary: 'Plans match exactly' };
  }

  // Build a human-readable diff summary
  const diffs = diffObjects(normalizedExpected, normalizedActual, '');
  const summaryParts = diffs.slice(0, 10); // cap at 10 differences
  const summary = summaryParts.join('; ');
  const suffix = diffs.length > 10 ? ` (and ${diffs.length - 10} more differences)` : '';

  return {
    match: false,
    diffSummary: summary + suffix || 'Plans differ structurally',
  };
}

// ── normalizeSql ────────────────────────────────────────────────
// Normalize SQL for comparison: collapse whitespace, lowercase,
// strip trailing semicolons.

function normalizeSql(input: string): string {
  return input.replace(/\s+/g, ' ').trim().toLowerCase().replace(/;$/, '');
}

// ── normalizeForComparison ──────────────────────────────────────
// Recursively sort object keys for deterministic comparison.

function normalizeForComparison(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map(normalizeForComparison);
  }
  if (typeof obj === 'object') {
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    for (const key of keys) {
      sorted[key] = normalizeForComparison((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return obj;
}

// ── diffObjects ─────────────────────────────────────────────────
// Returns an array of human-readable difference strings.

function diffObjects(
  expected: unknown,
  actual: unknown,
  path: string,
): string[] {
  const diffs: string[] = [];

  if (expected === actual) return diffs;

  if (typeof expected !== typeof actual) {
    diffs.push(`${path || 'root'}: type mismatch (expected ${typeof expected}, got ${typeof actual})`);
    return diffs;
  }

  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) {
      diffs.push(`${path || 'root'}: array length mismatch (expected ${expected.length}, got ${actual.length})`);
    }
    const maxLen = Math.max(expected.length, actual.length);
    for (let i = 0; i < maxLen; i++) {
      diffs.push(...diffObjects(expected[i], actual[i], `${path}[${i}]`));
    }
    return diffs;
  }

  if (typeof expected === 'object' && expected !== null && actual !== null) {
    const expectedObj = expected as Record<string, unknown>;
    const actualObj = actual as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(expectedObj), ...Object.keys(actualObj)]);

    for (const key of allKeys) {
      const keyPath = path ? `${path}.${key}` : key;
      if (!(key in expectedObj)) {
        diffs.push(`${keyPath}: unexpected key in actual plan`);
      } else if (!(key in actualObj)) {
        diffs.push(`${keyPath}: missing key in actual plan`);
      } else {
        diffs.push(...diffObjects(expectedObj[key], actualObj[key], keyPath));
      }
    }
    return diffs;
  }

  // Primitive mismatch
  diffs.push(
    `${path || 'root'}: value mismatch (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`,
  );
  return diffs;
}

// ── startRegressionRun ──────────────────────────────────────────
// Creates a new regression run, fetches matching golden examples,
// and creates pending result rows for each.

export async function startRegressionRun(
  adminId: string,
  input: StartRegressionRunInput,
): Promise<string> {
  const runId = generateUlid();
  const now = new Date();

  // Insert the run row with status='running'
  await db.insert(semanticEvalRegressionRuns).values({
    id: runId,
    name: input.name ?? null,
    status: 'running',
    triggerType: input.triggerType ?? 'manual',
    categoryFilter: input.categoryFilter ?? null,
    createdBy: adminId,
    startedAt: now,
  });

  // Fetch active examples matching the category filter
  const conditions = [eq(semanticEvalExamples.isActive, true)];
  if (input.categoryFilter) {
    conditions.push(eq(semanticEvalExamples.category, input.categoryFilter));
  }

  const examples = await db
    .select()
    .from(semanticEvalExamples)
    .where(and(...conditions))
    .orderBy(desc(semanticEvalExamples.qualityScore));

  // Create a pending result row for each example
  for (const example of examples) {
    const resultId = generateUlid();
    await db.insert(semanticEvalRegressionResults).values({
      id: resultId,
      runId,
      exampleId: example.id,
      status: 'pending',
      expectedPlan: example.plan as Record<string, unknown>,
    });
  }

  // Set totalExamples and exampleCount on the run
  await db
    .update(semanticEvalRegressionRuns)
    .set({
      totalExamples: examples.length,
      exampleCount: examples.length,
    })
    .where(eq(semanticEvalRegressionRuns.id, runId));

  return runId;
}

// ── executeRegressionExample ────────────────────────────────────
// Executes a single example in a regression run. Calls the
// pipeline via the injected interface, compares plan + SQL,
// and stores the result.

export async function executeRegressionExample(
  runId: string,
  resultId: string,
): Promise<RegressionResult> {
  // Fetch the result row
  const [resultRow] = await db
    .select()
    .from(semanticEvalRegressionResults)
    .where(
      and(
        eq(semanticEvalRegressionResults.id, resultId),
        eq(semanticEvalRegressionResults.runId, runId),
      ),
    )
    .limit(1);

  if (!resultRow) {
    throw new Error(`Regression result ${resultId} not found for run ${runId}`);
  }

  // Fetch the associated example
  const [example] = await db
    .select()
    .from(semanticEvalExamples)
    .where(eq(semanticEvalExamples.id, resultRow.exampleId))
    .limit(1);

  if (!example) {
    // Mark as errored — example was deleted after the run started
    await db
      .update(semanticEvalRegressionResults)
      .set({
        status: 'errored',
        executionError: `Example ${resultRow.exampleId} not found`,
        diffSummary: 'Example deleted before execution',
      })
      .where(eq(semanticEvalRegressionResults.id, resultId));

    return mapResult({
      ...resultRow,
      status: 'errored',
      executionError: `Example ${resultRow.exampleId} not found`,
      diffSummary: 'Example deleted before execution',
    });
  }

  const pipeline = getRegressionPipeline();

  try {
    const startMs = Date.now();
    const pipelineResult = await pipeline.runForRegression(
      example.question,
      example.tenantId ?? undefined,
    );
    const elapsedMs = Date.now() - startMs;

    if (pipelineResult.error) {
      // Pipeline returned an error
      await db
        .update(semanticEvalRegressionResults)
        .set({
          status: 'errored',
          actualPlan: pipelineResult.plan,
          actualSql: pipelineResult.sql,
          executionTimeMs: pipelineResult.executionTimeMs || elapsedMs,
          rowCount: pipelineResult.rowCount,
          executionError: pipelineResult.error,
          costUsd: pipelineResult.costUsd?.toString() ?? null,
          diffSummary: `Pipeline error: ${pipelineResult.error}`,
        })
        .where(eq(semanticEvalRegressionResults.id, resultId));

      return mapResult({
        ...resultRow,
        status: 'errored',
        actualPlan: pipelineResult.plan,
        actualSql: pipelineResult.sql,
        executionTimeMs: pipelineResult.executionTimeMs || elapsedMs,
        rowCount: pipelineResult.rowCount,
        executionError: pipelineResult.error,
        costUsd: pipelineResult.costUsd?.toString() ?? null,
        diffSummary: `Pipeline error: ${pipelineResult.error}`,
      });
    }

    // Compare plans
    const expectedPlan = example.plan as Record<string, unknown>;
    const actualPlan = pipelineResult.plan;
    const planComparison = comparePlans(expectedPlan, actualPlan);

    // Compare SQL (if both exist)
    let sqlMatchResult: boolean | null = null;
    if (resultRow.expectedSql && pipelineResult.sql) {
      sqlMatchResult =
        normalizeSql(resultRow.expectedSql) === normalizeSql(pipelineResult.sql);
    } else if (!resultRow.expectedSql && !pipelineResult.sql) {
      sqlMatchResult = true;
    }

    const status = planComparison.match ? 'passed' : 'failed';

    await db
      .update(semanticEvalRegressionResults)
      .set({
        status,
        actualPlan: actualPlan,
        actualSql: pipelineResult.sql,
        planMatch: planComparison.match,
        sqlMatch: sqlMatchResult,
        executionTimeMs: pipelineResult.executionTimeMs || elapsedMs,
        rowCount: pipelineResult.rowCount,
        costUsd: pipelineResult.costUsd?.toString() ?? null,
        diffSummary: planComparison.diffSummary,
      })
      .where(eq(semanticEvalRegressionResults.id, resultId));

    return mapResult({
      ...resultRow,
      status,
      actualPlan,
      actualSql: pipelineResult.sql,
      planMatch: planComparison.match,
      sqlMatch: sqlMatchResult,
      executionTimeMs: pipelineResult.executionTimeMs || elapsedMs,
      rowCount: pipelineResult.rowCount,
      costUsd: pipelineResult.costUsd?.toString() ?? null,
      diffSummary: planComparison.diffSummary,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    await db
      .update(semanticEvalRegressionResults)
      .set({
        status: 'errored',
        executionError: errorMessage,
        diffSummary: `Uncaught exception: ${errorMessage}`,
      })
      .where(eq(semanticEvalRegressionResults.id, resultId));

    return mapResult({
      ...resultRow,
      status: 'errored',
      executionError: errorMessage,
      diffSummary: `Uncaught exception: ${errorMessage}`,
    });
  }
}

// ── completeRegressionRun ───────────────────────────────────────
// Finalizes a regression run by aggregating result counts and
// computing pass rate, average latency, and total cost.

export async function completeRegressionRun(runId: string): Promise<RegressionRun> {
  // Count results by status
  const countsResult = await db.execute<{
    status: string;
    cnt: string;
    avg_latency: string | null;
    total_cost: string | null;
  }>(
    sql`SELECT
      status,
      COUNT(*) as cnt,
      AVG(execution_time_ms)::INTEGER as avg_latency,
      SUM(COALESCE(cost_usd, 0))::NUMERIC(10,4) as total_cost
    FROM semantic_eval_regression_results
    WHERE run_id = ${runId}
    GROUP BY status`,
  );

  const counts = Array.from(countsResult as Iterable<{
    status: string;
    cnt: string;
    avg_latency: string | null;
    total_cost: string | null;
  }>);

  let passed = 0;
  let failed = 0;
  let errored = 0;
  let totalLatencySum = 0;
  let latencyCount = 0;
  let totalCost = 0;

  for (const row of counts) {
    const cnt = parseInt(row.cnt, 10);
    if (row.status === 'passed') passed = cnt;
    else if (row.status === 'failed') failed = cnt;
    else if (row.status === 'errored') errored = cnt;

    if (row.avg_latency !== null) {
      totalLatencySum += Number(row.avg_latency) * cnt;
      latencyCount += cnt;
    }
    if (row.total_cost !== null) {
      totalCost += Number(row.total_cost);
    }
  }

  const total = passed + failed + errored;
  const passRate = total > 0 ? (passed / total) * 100 : null;
  const avgLatencyMs = latencyCount > 0 ? Math.round(totalLatencySum / latencyCount) : null;
  const now = new Date();

  await db
    .update(semanticEvalRegressionRuns)
    .set({
      status: 'completed',
      passed,
      failed,
      errored,
      passRate: passRate !== null ? passRate.toFixed(2) : null,
      avgLatencyMs,
      totalCostUsd: totalCost.toFixed(4),
      completedAt: now,
    })
    .where(eq(semanticEvalRegressionRuns.id, runId));

  // Fetch and return the completed run
  const [run] = await db
    .select()
    .from(semanticEvalRegressionRuns)
    .where(eq(semanticEvalRegressionRuns.id, runId))
    .limit(1);

  if (!run) {
    throw new Error(`Regression run ${runId} not found after completion`);
  }

  return mapRun(run);
}

// ── getRegressionRun ────────────────────────────────────────────
// Returns the run details with all associated results.

export async function getRegressionRun(runId: string): Promise<RegressionRunWithResults | null> {
  const [run] = await db
    .select()
    .from(semanticEvalRegressionRuns)
    .where(eq(semanticEvalRegressionRuns.id, runId))
    .limit(1);

  if (!run) return null;

  const results = await db
    .select()
    .from(semanticEvalRegressionResults)
    .where(eq(semanticEvalRegressionResults.runId, runId))
    .orderBy(desc(semanticEvalRegressionResults.createdAt));

  return {
    run: mapRun(run),
    results: results.map(mapResult),
  };
}

// ── listRegressionRuns ──────────────────────────────────────────
// Lists all runs with cursor pagination and optional status filter.

export async function listRegressionRuns(
  filters: ListRegressionRunsFilters = {},
): Promise<ListRegressionRunsResult> {
  const pageSize = Math.min(filters.limit ?? 20, 100);

  const conditions: ReturnType<typeof eq>[] = [];

  if (filters.status) {
    conditions.push(eq(semanticEvalRegressionRuns.status, filters.status));
  }

  if (filters.cursor) {
    conditions.push(
      sql`${semanticEvalRegressionRuns.id} < ${filters.cursor}`,
    );
  }

  const rows = await db
    .select()
    .from(semanticEvalRegressionRuns)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(semanticEvalRegressionRuns.createdAt))
    .limit(pageSize + 1);

  const hasMore = rows.length > pageSize;
  const items = hasMore ? rows.slice(0, pageSize) : rows;

  return {
    runs: items.map(mapRun),
    cursor: hasMore ? items[items.length - 1]!.id : null,
    hasMore,
  };
}

// ── getRegressionTrend ──────────────────────────────────────────
// Groups completed runs by date and returns pass rate trend.

export async function getRegressionTrend(
  dateRange: { start: string; end: string },
): Promise<RegressionTrendPoint[]> {
  const rows = await db.execute<{
    date: string;
    pass_rate: string;
    total_examples: string;
  }>(
    sql`SELECT
      DATE(completed_at) as date,
      AVG(pass_rate)::NUMERIC(5,2) as pass_rate,
      SUM(total_examples)::INTEGER as total_examples
    FROM semantic_eval_regression_runs
    WHERE status = 'completed'
      AND completed_at BETWEEN ${dateRange.start}::TIMESTAMPTZ AND ${dateRange.end}::TIMESTAMPTZ
    GROUP BY DATE(completed_at)
    ORDER BY DATE(completed_at)`,
  );

  return Array.from(rows as Iterable<{
    date: string;
    pass_rate: string;
    total_examples: string;
  }>).map((r) => ({
    date: r.date,
    passRate: Number(r.pass_rate),
    totalExamples: parseInt(r.total_examples, 10),
  }));
}

// ── Row mappers ─────────────────────────────────────────────────

function mapRun(row: typeof semanticEvalRegressionRuns.$inferSelect): RegressionRun {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    triggerType: row.triggerType,
    exampleCount: row.exampleCount,
    categoryFilter: row.categoryFilter,
    totalExamples: row.totalExamples,
    passed: row.passed,
    failed: row.failed,
    errored: row.errored,
    passRate: row.passRate !== null ? Number(row.passRate) : null,
    avgLatencyMs: row.avgLatencyMs,
    totalCostUsd: row.totalCostUsd !== null ? Number(row.totalCostUsd) : null,
    modelConfig: row.modelConfig as Record<string, unknown> | null,
    promptSnapshot: row.promptSnapshot,
    createdBy: row.createdBy,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapResult(
  row: typeof semanticEvalRegressionResults.$inferSelect | Record<string, unknown>,
): RegressionResult {
  // Handle both Drizzle select result and manual override objects
  const r = row as Record<string, unknown>;
  return {
    id: r.id as string,
    runId: r.runId as string,
    exampleId: r.exampleId as string,
    status: r.status as 'pending' | 'passed' | 'failed' | 'errored',
    expectedPlan: (r.expectedPlan as Record<string, unknown>) ?? null,
    actualPlan: (r.actualPlan as Record<string, unknown>) ?? null,
    planMatch: (r.planMatch as boolean) ?? null,
    expectedSql: (r.expectedSql as string) ?? null,
    actualSql: (r.actualSql as string) ?? null,
    sqlMatch: (r.sqlMatch as boolean) ?? null,
    executionTimeMs: (r.executionTimeMs as number) ?? null,
    rowCount: (r.rowCount as number) ?? null,
    executionError: (r.executionError as string) ?? null,
    costUsd: r.costUsd !== null && r.costUsd !== undefined ? Number(r.costUsd) : null,
    diffSummary: (r.diffSummary as string) ?? null,
    createdAt: r.createdAt instanceof Date
      ? r.createdAt.toISOString()
      : (r.createdAt as string) ?? new Date().toISOString(),
  };
}
