import type { PipelineInput, PipelineOutput, QueryResult } from './types';
import { resolveIntent } from './intent-resolver';
import { executeCompiledQuery } from './executor';
import { generateNarrative, buildEmptyResultNarrative, buildDataFallbackNarrative } from './narrative';
import { generateSql } from './sql-generator';
import { validateGeneratedSql } from './sql-validator';
import { executeSqlQuery } from './sql-executor';
import { retrySqlGeneration } from './sql-retry';
import { compilePlan } from '../compiler/compiler';
import { buildRegistryCatalog, getLens } from '../registry/registry';
import { buildSchemaCatalog } from '../schema/schema-catalog';
import { getEvalCaptureService } from '../evaluation/capture';
import { getLLMAdapter, setLLMAdapter } from './adapters/anthropic';
import { getFromQueryCache, setInQueryCache } from '../cache/query-cache';
import { getFromLLMCache, setInLLMCache, hashSystemPrompt, getStaleFromLLMCache } from '../cache/llm-cache';
import { recordSemanticRequest } from '../observability/metrics';
import { generateUlid } from '@oppsera/shared';
import { coalesceRequest, buildCoalesceKey, getCircuitBreakerStatus } from './adapters/resilience';
import { setAdaptiveBackoffLevel } from '../cache/semantic-rate-limiter';
import { generateFollowUps } from '../intelligence/follow-up-generator';
import { inferChartConfig } from '../intelligence/chart-inferrer';
import { scoreDataQuality } from '../intelligence/data-quality-scorer';

export { getLLMAdapter, setLLMAdapter };

// ── Time budget helpers ────────────────────────────────────────────
// The Vercel function has a 60s hard limit (maxDuration = 60). We track
// elapsed time at key decision points and skip expensive operations
// when running low, to prevent 504 timeouts.

const PIPELINE_BUDGET_MS = 50_000; // 50s — leaves 10s for response serialization + network

function remainingMs(startMs: number): number {
  return PIPELINE_BUDGET_MS - (Date.now() - startMs);
}

function shouldSkipExpensiveOp(startMs: number, minRequiredMs: number): boolean {
  return remainingMs(startMs) < minRequiredMs;
}

// ── Pipeline ──────────────────────────────────────────────────────
// Orchestrates: intent resolution → compilation/sql-gen → execution → narrative
// Two modes:
//   Mode A (metrics): intent → compile → execute → narrate
//   Mode B (sql):     intent → generate SQL → validate → execute → narrate
// Captures an EvalTurn after completion (best-effort, never blocks response).

export async function runPipeline(input: PipelineInput): Promise<PipelineOutput> {
  const { message, context } = input;
  const { tenantId } = context;

  // ── Request coalescing: identical concurrent questions share one LLM call ──
  const coalesceKey = buildCoalesceKey(tenantId, message, context.history);
  return coalesceRequest(coalesceKey, () => _runPipelineInner(input));
}

async function _runPipelineInner(input: PipelineInput): Promise<PipelineOutput> {
  const { message, context, examples = [] } = input;
  const { tenantId, lensSlug } = context;

  const startMs = Date.now();
  let evalTurnId: string | null = null;

  // ── Circuit breaker graceful degradation ──────────────────────
  // When the LLM API circuit breaker is OPEN, try to serve from LLM cache
  // before failing fast. This gives a stale-but-useful response instead of
  // an error when the Anthropic API is temporarily unavailable.
  const cbStatus = getCircuitBreakerStatus();
  if (cbStatus.state === 'OPEN') {
    console.warn(`[semantic] Circuit breaker is OPEN — attempting cache fallback (retry in ${Math.ceil(cbStatus.retryAfterMs / 1000)}s)`);
    const narrativePromptKey = hashSystemPrompt(`fallback:${context.lensSlug ?? 'default'}`);
    const dataSummary = ''; // no data fingerprint for fallback
    const cachedNarrative = getStaleFromLLMCache(tenantId, narrativePromptKey, message + dataSummary, context.history);
    if (cachedNarrative) {
      console.log('[semantic] Serving stale cached response while circuit breaker is OPEN');
      let sections: PipelineOutput['sections'] = [];
      try { sections = JSON.parse(cachedNarrative.model) as PipelineOutput['sections']; } catch { /* fallback to empty */ }
      return {
        mode: 'metrics',
        narrative: cachedNarrative.content,
        sections,
        data: null,
        plan: null,
        isClarification: false,
        clarificationText: null,
        evalTurnId: null,
        llmConfidence: null,
        llmLatencyMs: 0,
        executionTimeMs: null,
        tokensInput: 0,
        tokensOutput: 0,
        provider: '',
        model: '',
        compiledSql: null,
        compilationErrors: [],
        tablesAccessed: [],
        cacheStatus: 'STALE',
      };
    }
    // No cache entry — fall through and let the adapter throw CircuitOpenError
    // which will be caught in the intent resolution try/catch below.
  }

  // ── 1. Load registry catalog + schema catalog in parallel ───────
  console.log('[semantic] Pipeline start — loading registry + schema...');
  const lens = lensSlug ? await getLens(lensSlug, tenantId) : null;
  const domain = lens?.domain;

  const [catalog, schemaCatalog] = await Promise.all([
    buildRegistryCatalog(domain),
    buildSchemaCatalog().catch((err) => {
      console.warn('[semantic] Schema catalog load failed (non-blocking):', err);
      return null;
    }),
  ]);
  console.log(`[semantic] Registry loaded in ${Date.now() - startMs}ms (${catalog.metrics.length} metrics, ${catalog.dimensions.length} dims, ${schemaCatalog?.tables.length ?? 0} schema tables)`);

  const lensPromptFragment = lens?.systemPromptFragment ?? null;

  // ── 2. Intent resolution (with schema summary for mode routing) ──
  console.log('[semantic] Resolving intent via LLM...');
  const intentStart = Date.now();
  let intent;
  try {
    intent = await resolveIntent(message, context, {
      catalog,
      examples,
      lensPromptFragment,
      schemaSummary: schemaCatalog?.summaryText ?? null,
    });
    console.log(`[semantic] Intent resolved in ${Date.now() - intentStart}ms (mode=${intent.mode}, clarification=${intent.isClarification}, confidence=${intent.confidence})`);

    // ── Sync adaptive backoff with circuit breaker health ──
    // After a successful LLM call, check the circuit breaker error rate
    // and adjust the rate limiter accordingly.
    const postIntentCb = getCircuitBreakerStatus();
    if (postIntentCb.errorRate >= 0.4) {
      setAdaptiveBackoffLevel('reduced');
    } else if (postIntentCb.errorRate >= 0.1) {
      // Some errors but not critical — keep monitoring
      setAdaptiveBackoffLevel('normal');
    } else {
      setAdaptiveBackoffLevel('normal');
    }
  } catch (err) {
    console.error(`[semantic] Intent resolution FAILED in ${Date.now() - intentStart}ms:`, err);
    const errStr = String(err);
    const errLower = errStr.toLowerCase();
    const isRateLimit = errLower.includes('rate limit') || errLower.includes('429');
    const isOverloaded = errLower.includes('529') || errLower.includes('503') || errLower.includes('overloaded');
    const isTimeout = errLower.includes('timed out') || errLower.includes('timeout');
    const isCircuitOpen = errLower.includes('circuit breaker');

    // ── Adaptive backoff: reduce rate when LLM API is failing ──
    if (isRateLimit || isOverloaded || isCircuitOpen) {
      setAdaptiveBackoffLevel('minimal');
    } else if (isTimeout) {
      setAdaptiveBackoffLevel('reduced');
    }
    const userMessage = isRateLimit || isOverloaded
      ? "I'm experiencing high demand right now. Please try again in a minute — your question is a good one and I want to give it a proper answer."
      : isTimeout
        ? "That analysis took longer than expected. Please try a simpler question or try again in a moment."
        : "I wasn't able to process that question right now. Please try rephrasing or try again shortly.";
    return {
      mode: 'metrics',
      narrative: `## Answer\n\n${userMessage}`,
      sections: [{ type: 'answer' as const, content: userMessage }],
      data: null,
      plan: null,
      isClarification: false,
      clarificationText: null,
      evalTurnId: null,
      llmConfidence: null,
      llmLatencyMs: 0,
      executionTimeMs: null,
      tokensInput: 0,
      tokensOutput: 0,
      provider: '',
      model: '',
      compiledSql: null,
      compilationErrors: [errStr],
      tablesAccessed: [],
      cacheStatus: 'SKIP',
    };
  }

  // ── 3. Clarification short-circuit ────────────────────────────
  if (intent.isClarification) {
    evalTurnId = generateUlid();
    void captureEvalTurnBestEffort({
      id: evalTurnId,
      message,
      context,
      intent,
      compiledSql: null,
      compilationErrors: [],
      tablesAccessed: [],
      executionTimeMs: null,
      rowCount: null,
      resultSample: null,
      executionError: null,
      cacheStatus: 'SKIP',
      narrative: intent.clarificationText ?? null,
      responseSections: [],
    });

    return {
      mode: intent.mode,
      narrative: intent.clarificationText ?? null,
      sections: [],
      data: null,
      plan: intent.plan,
      isClarification: true,
      clarificationText: intent.clarificationText ?? null,
      clarificationOptions: intent.clarificationOptions,
      evalTurnId,
      llmConfidence: intent.confidence,
      llmLatencyMs: intent.latencyMs,
      executionTimeMs: null,
      tokensInput: intent.tokensInput,
      tokensOutput: intent.tokensOutput,
      provider: intent.provider,
      model: intent.model,
      compiledSql: null,
      compilationErrors: [],
      tablesAccessed: [],
      cacheStatus: 'SKIP',
    };
  }

  // ── 4. Branch by mode ─────────────────────────────────────────
  // Hard override: if intent says "metrics" but ALL requested metrics target
  // snapshot read models that are often empty (rm_inventory_on_hand),
  // force SQL mode to query operational tables directly.
  if (intent.mode === 'metrics' && schemaCatalog && intent.plan.metrics.length > 0) {
    const SNAPSHOT_ONLY_TABLES = new Set(['rm_inventory_on_hand']);
    const allMetricsFromSnapshot = intent.plan.metrics.every((slug) => {
      const metricDef = catalog.metrics.find((m: { slug: string }) => m.slug === slug);
      return metricDef && SNAPSHOT_ONLY_TABLES.has(metricDef.sqlTable);
    });
    if (allMetricsFromSnapshot) {
      console.log('[semantic] All metrics target snapshot-only read models — overriding to SQL mode');
      intent = { ...intent, mode: 'sql' as const };
    }
  }

  if (intent.mode === 'sql' && schemaCatalog) {
    return runSqlMode(input, intent, schemaCatalog, lensPromptFragment, startMs);
  }

  // Mode A (metrics) — with automatic fallback to Mode B (SQL) when read models are empty
  // When schema catalog is available and we might fall back to SQL mode, skip the
  // narrative LLM call on 0-row metrics results to avoid a wasted ~5-10s Sonnet call.
  const metricsResult = await runMetricsMode(
    schemaCatalog ? { ...input, skipNarrative: true } : input,
    intent, lensPromptFragment, startMs,
  );

  // ── 5. Fallback: if metrics mode returned 0 rows OR errored (data===null),
  //       retry via SQL mode to query operational tables directly ──────────
  //       BUT only if we have enough time budget remaining (SQL mode needs ~20s)
  const metricsHadNoData = !metricsResult.data || metricsResult.data.rowCount === 0;
  if (
    metricsHadNoData &&
    schemaCatalog &&
    !metricsResult.isClarification &&
    !shouldSkipExpensiveOp(startMs, 20_000) // need at least 20s for SQL gen + execute + narrative
  ) {
    const reason = !metricsResult.data ? 'errored (data=null)' : 'returned 0 rows';
    console.log(`[semantic] Metrics mode ${reason} — falling back to SQL mode (${remainingMs(startMs)}ms remaining)`);
    try {
      const sqlResult = await runSqlMode(input, intent, schemaCatalog, lensPromptFragment, startMs);
      // Only use SQL result if it actually found data
      if (sqlResult.data && sqlResult.data.rowCount > 0) {
        console.log(`[semantic] SQL fallback succeeded: ${sqlResult.data.rowCount} rows from operational tables`);
        return sqlResult;
      }
      console.log('[semantic] SQL fallback also returned 0 rows — using metrics result');
    } catch (err) {
      console.warn('[semantic] SQL fallback failed (non-blocking):', err instanceof Error ? err.message : err);
    }
  } else if (
    metricsHadNoData &&
    schemaCatalog &&
    !metricsResult.isClarification
  ) {
    console.log(`[semantic] Skipping SQL fallback — only ${remainingMs(startMs)}ms remaining (need 20s)`);
  }

  // If we skipped narrative for the fallback optimization, generate it now.
  // IMPORTANT: Don't re-run the full compile+execute — just generate the narrative
  // for the already-computed metrics result.
  if (schemaCatalog && !metricsResult.narrative) {
    console.log(`[semantic] Generating deferred narrative for metrics result (${remainingMs(startMs)}ms remaining)`);
    const useFast = shouldSkipExpensiveOp(startMs, 20_000);
    try {
      const narrativeResult = await generateNarrative(
        metricsResult.data,
        intent,
        message,
        context,
        {
          lensSlug: context.lensSlug,
          lensPromptFragment,
          fast: useFast,
          timeoutMs: Math.max(5_000, remainingMs(startMs) - 2_000),
        },
      );
      return {
        ...metricsResult,
        narrative: narrativeResult.text,
        sections: narrativeResult.sections,
        tokensInput: metricsResult.tokensInput + narrativeResult.tokensInput,
        tokensOutput: metricsResult.tokensOutput + narrativeResult.tokensOutput,
      };
    } catch (narrativeErr) {
      console.warn('[semantic] Deferred narrative failed, using fallback:', narrativeErr instanceof Error ? narrativeErr.message : narrativeErr);
      const fallback = metricsResult.data && metricsResult.data.rowCount > 0
        ? buildDataFallbackNarrative(message, metricsResult.data)
        : buildEmptyResultNarrative(message, context);
      return {
        ...metricsResult,
        narrative: fallback.text,
        sections: fallback.sections,
      };
    }
  }

  return metricsResult;
}

// ── Mode A: Metrics-based pipeline ──────────────────────────────

async function runMetricsMode(
  input: PipelineInput,
  intent: Awaited<ReturnType<typeof resolveIntent>>,
  lensPromptFragment: string | null,
  startMs: number,
): Promise<PipelineOutput> {
  const { message, context, skipNarrative = false } = input;
  const { tenantId } = context;

  let evalTurnId: string | null = null;

  // ── Compilation ────────────────────────────────────────────────
  let compiled;
  let compilationErrors: string[] = [];
  let tablesAccessed: string[] = [];
  let compiledSql: string | null = null;

  try {
    compiled = await compilePlan({
      plan: intent.plan,
      tenantId,
      locationId: context.locationId,
    });
    compiledSql = compiled.sql;
    tablesAccessed = [compiled.primaryTable, ...compiled.joinTables].filter(Boolean);
    if (compiled.warnings.length > 0) {
      compilationErrors = compiled.warnings;
    }
  } catch (err) {
    const errMsg = String(err);
    compilationErrors = [errMsg];

    const advisor = await safeAdvisorNarrative(skipNarrative, intent, message, context, lensPromptFragment, startMs);

    evalTurnId = generateUlid();
    void captureEvalTurnBestEffort({
      id: evalTurnId, message, context, intent,
      compiledSql: null, compilationErrors, tablesAccessed: [],
      executionTimeMs: null, rowCount: null, resultSample: null,
      executionError: errMsg, cacheStatus: 'MISS',
      narrative: advisor.text, responseSections: advisor.sectionTypes,
    });

    return {
      mode: 'metrics',
      narrative: advisor.text,
      sections: advisor.sections,
      data: null,
      plan: intent.plan,
      isClarification: false,
      clarificationText: null,
      evalTurnId,
      llmConfidence: intent.confidence,
      llmLatencyMs: intent.latencyMs,
      executionTimeMs: null,
      tokensInput: intent.tokensInput + advisor.tokensIn,
      tokensOutput: intent.tokensOutput + advisor.tokensOut,
      provider: intent.provider,
      model: intent.model,
      compiledSql: null,
      compilationErrors,
      tablesAccessed: [],
      cacheStatus: 'MISS',
    };
  }

  // ── Execution (with query cache) ──────────────────────────────
  let queryResult: QueryResult;
  let cacheStatus: PipelineOutput['cacheStatus'] = 'MISS';

  const cachedResult = getFromQueryCache(tenantId, compiled.sql, compiled.params);
  if (cachedResult) {
    cacheStatus = 'HIT';
    queryResult = {
      rows: cachedResult.rows,
      rowCount: cachedResult.rowCount,
      executionTimeMs: 0,
      truncated: false,
    };
  } else {
    try {
      queryResult = await executeCompiledQuery(compiled, { tenantId });
      setInQueryCache(tenantId, compiled.sql, compiled.params, queryResult.rows, queryResult.rowCount);
    } catch (err) {
      const executionError = String(err);

      const advisor = await safeAdvisorNarrative(skipNarrative, intent, message, context, lensPromptFragment, startMs);

      evalTurnId = generateUlid();
      void captureEvalTurnBestEffort({
        id: evalTurnId, message, context, intent,
        compiledSql, compilationErrors, tablesAccessed,
        executionTimeMs: null, rowCount: null, resultSample: null,
        executionError, cacheStatus: 'MISS',
        narrative: advisor.text, responseSections: advisor.sectionTypes,
      });

      return {
        mode: 'metrics',
        narrative: advisor.text,
        sections: advisor.sections,
        data: null,
        plan: intent.plan,
        isClarification: false,
        clarificationText: null,
        evalTurnId,
        llmConfidence: intent.confidence,
        llmLatencyMs: intent.latencyMs,
        executionTimeMs: null,
        tokensInput: intent.tokensInput + advisor.tokensIn,
        tokensOutput: intent.tokensOutput + advisor.tokensOut,
        provider: intent.provider,
        model: intent.model,
        compiledSql,
        compilationErrors: [executionError],
        tablesAccessed,
        cacheStatus: 'MISS',
      };
    }
  }

  // ── Narrative (with LLM response cache) ────────────────────────
  let narrativeText: string | null = null;
  let narrativeSections: PipelineOutput['sections'] = [];
  let narrativeTokensIn = 0;
  let narrativeTokensOut = 0;

  if (!skipNarrative) {
    // Check LLM cache for narrative — keyed on lens context + question + data fingerprint
    const narrativePromptKey = hashSystemPrompt(`metrics:${context.lensSlug ?? 'default'}:${queryResult.rowCount}`);
    const dataSummary = JSON.stringify(queryResult.rows.slice(0, 3));
    const cachedNarrative = getFromLLMCache(tenantId, narrativePromptKey, message + dataSummary, context.history);

    if (cachedNarrative) {
      narrativeText = cachedNarrative.content;
      narrativeSections = JSON.parse(cachedNarrative.model) as PipelineOutput['sections'];
      console.log('[semantic] Narrative served from LLM cache');
    } else {
      // Use fast model when time budget is tight
      const useFast = shouldSkipExpensiveOp(startMs, 20_000);
      if (useFast) console.log(`[semantic] Using fast narrative model (${remainingMs(startMs)}ms remaining)`);
      try {
        const narrativeResult = await generateNarrative(queryResult, intent, message, context, {
          lensSlug: context.lensSlug,
          lensPromptFragment,
          metricDefs: compiled.metaDefs,
          dimensionDefs: compiled.dimensionDefs,
          fast: useFast,
          timeoutMs: Math.max(5_000, remainingMs(startMs) - 2_000), // leave 2s for response
        });
        narrativeText = narrativeResult.text;
        narrativeSections = narrativeResult.sections;
        narrativeTokensIn = narrativeResult.tokensInput;
        narrativeTokensOut = narrativeResult.tokensOutput;

        // Cache the narrative response
        setInLLMCache(tenantId, narrativePromptKey, message + dataSummary, context.history, {
          content: narrativeResult.text,
          tokensInput: narrativeResult.tokensInput,
          tokensOutput: narrativeResult.tokensOutput,
          model: JSON.stringify(narrativeResult.sections),
          provider: intent.provider,
          latencyMs: 0,
        });
      } catch (narrativeErr) {
        console.warn('[semantic] Narrative generation failed (metrics mode), using data-aware fallback:', narrativeErr instanceof Error ? narrativeErr.message : narrativeErr);
        // Use data-aware fallback when we have rows, empty fallback when we don't
        const fallback = queryResult.rowCount > 0
          ? buildDataFallbackNarrative(message, queryResult)
          : buildEmptyResultNarrative(message, context);
        narrativeText = fallback.text;
        narrativeSections = fallback.sections;
      }
    }
  }

  // ── Follow-ups & chart config ────────────────────────────────
  const suggestedFollowUps = generateFollowUps(message, intent.plan, narrativeSections, context);
  const chartConfig = compiled ? inferChartConfig(intent.plan, compiled, queryResult) : null;

  // ── Data quality scoring ───────────────────────────────────
  const dataQuality = scoreDataQuality({
    rowCount: queryResult.rowCount,
    executionTimeMs: queryResult.executionTimeMs,
    dateRange: intent.plan.dateRange ?? undefined,
    compiledSql,
    compilationErrors,
    llmConfidence: intent.confidence,
    schemaTablesUsed: tablesAccessed,
  });

  // ── Eval capture ──────────────────────────────────────────────
  const resultSample = queryResult.rows.slice(0, 5);
  evalTurnId = generateUlid();
  void captureEvalTurnBestEffort({
    id: evalTurnId, message, context, intent,
    compiledSql, compilationErrors, tablesAccessed,
    executionTimeMs: queryResult.executionTimeMs,
    rowCount: queryResult.rowCount, resultSample,
    executionError: null, cacheStatus,
    narrative: narrativeText,
    responseSections: narrativeSections.map((s) => s.type),
  });

  const totalLatencyMs = Date.now() - startMs;
  recordSemanticRequest({
    tenantId,
    latencyMs: totalLatencyMs,
    llmLatencyMs: intent.latencyMs,
    executionTimeMs: queryResult.executionTimeMs,
    tokensInput: intent.tokensInput + narrativeTokensIn,
    tokensOutput: intent.tokensOutput + narrativeTokensOut,
    cacheStatus,
    hadError: false,
    isClarification: false,
  });

  return {
    mode: 'metrics',
    narrative: narrativeText,
    sections: narrativeSections,
    data: queryResult,
    plan: intent.plan,
    isClarification: false,
    clarificationText: null,
    evalTurnId,
    llmConfidence: intent.confidence,
    llmLatencyMs: intent.latencyMs,
    executionTimeMs: queryResult.executionTimeMs,
    tokensInput: intent.tokensInput + narrativeTokensIn,
    tokensOutput: intent.tokensOutput + narrativeTokensOut,
    provider: intent.provider,
    model: intent.model,
    compiledSql,
    compilationErrors,
    tablesAccessed,
    cacheStatus,
    suggestedFollowUps,
    chartConfig,
    dataQuality,
  };
}

// ── Mode B: Direct SQL pipeline ─────────────────────────────────

async function runSqlMode(
  input: PipelineInput,
  intent: Awaited<ReturnType<typeof resolveIntent>>,
  schemaCatalog: Awaited<ReturnType<typeof buildSchemaCatalog>>,
  lensPromptFragment: string | null,
  startMs: number,
): Promise<PipelineOutput> {
  const { message, context, skipNarrative = false } = input;
  const { tenantId } = context;

  let evalTurnId: string | null = null;
  let totalTokensIn = intent.tokensInput;
  let totalTokensOut = intent.tokensOutput;

  // ── SQL Generation ────────────────────────────────────────────
  console.log('[semantic] Mode B: Generating SQL via LLM...');
  const sqlGenStart = Date.now();
  let sqlResult;
  try {
    sqlResult = await generateSql(message, context, { schemaCatalog });
    totalTokensIn += sqlResult.tokensInput;
    totalTokensOut += sqlResult.tokensOutput;
    console.log(`[semantic] SQL generated in ${Date.now() - sqlGenStart}ms (confidence=${sqlResult.confidence})`);
  } catch (err) {
    const errMsg = `SQL generation failed: ${String(err)}`;
    console.error(`[semantic] ${errMsg}`);

    const advisor = await safeAdvisorNarrative(skipNarrative, intent, message, context, lensPromptFragment, startMs);

    evalTurnId = generateUlid();
    void captureEvalTurnBestEffort({
      id: evalTurnId, message, context, intent,
      compiledSql: null, compilationErrors: [errMsg], tablesAccessed: [],
      executionTimeMs: null, rowCount: null, resultSample: null,
      executionError: errMsg, cacheStatus: 'MISS',
      narrative: advisor.text, responseSections: advisor.sectionTypes,
    });

    return {
      mode: 'sql',
      narrative: advisor.text,
      sections: advisor.sections,
      data: null,
      plan: intent.plan,
      isClarification: false,
      clarificationText: null,
      evalTurnId,
      llmConfidence: intent.confidence,
      llmLatencyMs: intent.latencyMs + (Date.now() - sqlGenStart),
      executionTimeMs: null,
      tokensInput: totalTokensIn + advisor.tokensIn,
      tokensOutput: totalTokensOut + advisor.tokensOut,
      provider: intent.provider,
      model: intent.model,
      compiledSql: null,
      compilationErrors: [errMsg],
      tablesAccessed: [],
      cacheStatus: 'MISS',
    };
  }

  // ── SQL Validation ────────────────────────────────────────────
  const validation = validateGeneratedSql(sqlResult.sql, schemaCatalog.tableNames);
  if (!validation.valid) {
    const errMsg = `SQL validation failed: ${validation.errors.join('; ')}`;
    console.warn(`[semantic] ${errMsg}`);
    console.warn(`[semantic] Rejected SQL: ${sqlResult.sql.slice(0, 500)}`);

    const advisor = await safeAdvisorNarrative(skipNarrative, intent, message, context, lensPromptFragment, startMs);

    evalTurnId = generateUlid();
    void captureEvalTurnBestEffort({
      id: evalTurnId, message, context, intent,
      compiledSql: sqlResult.sql, compilationErrors: validation.errors, tablesAccessed: [],
      executionTimeMs: null, rowCount: null, resultSample: null,
      executionError: errMsg, cacheStatus: 'MISS',
      narrative: advisor.text, responseSections: advisor.sectionTypes,
    });

    return {
      mode: 'sql',
      narrative: advisor.text,
      sections: advisor.sections,
      data: null,
      plan: intent.plan,
      isClarification: false,
      clarificationText: null,
      evalTurnId,
      llmConfidence: intent.confidence,
      llmLatencyMs: intent.latencyMs + sqlResult.latencyMs,
      executionTimeMs: null,
      tokensInput: totalTokensIn + advisor.tokensIn,
      tokensOutput: totalTokensOut + advisor.tokensOut,
      provider: intent.provider,
      model: intent.model,
      compiledSql: sqlResult.sql,
      compilationErrors: validation.errors,
      tablesAccessed: [],
      cacheStatus: 'MISS',
    };
  }

  let validatedSql = validation.sanitizedSql;

  // ── Execution (with query cache) ──────────────────────────────
  // Definite assignment assertion: all non-return paths through the if/else/retry block set this
  let queryResult!: QueryResult;
  let cacheStatus: PipelineOutput['cacheStatus'] = 'MISS';

  const cachedResult = getFromQueryCache(tenantId, validatedSql, [tenantId]);
  if (cachedResult) {
    cacheStatus = 'HIT';
    queryResult = {
      rows: cachedResult.rows,
      rowCount: cachedResult.rowCount,
      executionTimeMs: 0,
      truncated: false,
    };
  } else {
    try {
      queryResult = await executeSqlQuery(validatedSql, { tenantId });
      setInQueryCache(tenantId, validatedSql, [tenantId], queryResult.rows, queryResult.rowCount);
    } catch (err) {
      const executionError = String(err);
      console.warn(`[semantic] SQL execution failed: ${executionError}`);

      // ── SQL Auto-Correction Retry ──────────────────────────────
      // Send the failed SQL + error back to the LLM for one correction attempt
      // Skip retry if time budget is too tight (need ~15s for retry + narrative)
      let retrySucceeded = false;
      if (shouldSkipExpensiveOp(startMs, 15_000)) {
        console.log(`[semantic] Skipping SQL retry — only ${remainingMs(startMs)}ms remaining`);
      } else try {
        console.log(`[semantic] Attempting SQL auto-correction retry (${remainingMs(startMs)}ms remaining)...`);
        const retryResult = await retrySqlGeneration({
          originalQuestion: message,
          failedSql: validatedSql,
          errorMessage: executionError,
          context,
          options: {
            maxRetries: 1,
            schemaContext: schemaCatalog.summaryText,
          },
        });
        totalTokensIn += retryResult.tokensInput;
        totalTokensOut += retryResult.tokensOutput;

        // Validate the corrected SQL before executing
        const retryValidation = validateGeneratedSql(retryResult.correctedSql, schemaCatalog.tableNames);
        if (retryValidation.valid) {
          queryResult = await executeSqlQuery(retryValidation.sanitizedSql, { tenantId });
          setInQueryCache(tenantId, retryValidation.sanitizedSql, [tenantId], queryResult.rows, queryResult.rowCount);
          // Update references so the rest of the pipeline uses the corrected version
          validatedSql = retryValidation.sanitizedSql;
          sqlResult = {
            ...sqlResult,
            sql: retryValidation.sanitizedSql,
            explanation: `${sqlResult.explanation} [Auto-corrected: ${retryResult.explanation}]`,
          };
          retrySucceeded = true;
          console.log(`[semantic] SQL auto-correction succeeded (retry ${retryResult.retryCount})`);
        } else {
          console.warn('[semantic] Corrected SQL failed validation:', retryValidation.errors);
        }
      } catch (retryErr) {
        console.warn('[semantic] SQL auto-correction retry failed:', retryErr);
      }

      if (!retrySucceeded) {
        const advisor = await safeAdvisorNarrative(skipNarrative, intent, message, context, lensPromptFragment, startMs);

        evalTurnId = generateUlid();
        void captureEvalTurnBestEffort({
          id: evalTurnId, message, context, intent,
          compiledSql: validatedSql, compilationErrors: [],
          tablesAccessed: extractTablesFromSql(validatedSql),
          executionTimeMs: null, rowCount: null, resultSample: null,
          executionError, cacheStatus: 'MISS',
          narrative: advisor.text, responseSections: advisor.sectionTypes,
        });

        return {
          mode: 'sql',
          narrative: advisor.text,
          sections: advisor.sections,
          data: null,
          plan: intent.plan,
          isClarification: false,
          clarificationText: null,
          evalTurnId,
          llmConfidence: intent.confidence,
          llmLatencyMs: intent.latencyMs + sqlResult.latencyMs,
          executionTimeMs: null,
          tokensInput: totalTokensIn + advisor.tokensIn,
          tokensOutput: totalTokensOut + advisor.tokensOut,
          provider: intent.provider,
          model: intent.model,
          compiledSql: validatedSql,
          compilationErrors: [executionError],
          tablesAccessed: extractTablesFromSql(validatedSql),
          cacheStatus: 'MISS',
        };
      }
    }
  }

  const tablesAccessed = extractTablesFromSql(validatedSql);

  // ── Narrative (with LLM response cache) ────────────────────────
  let narrativeText: string | null = null;
  let narrativeSections: PipelineOutput['sections'] = [];
  let narrativeTokensIn = 0;
  let narrativeTokensOut = 0;

  if (!skipNarrative) {
    // Check LLM cache for narrative — keyed on lens context + question + data fingerprint
    const narrativePromptKey = hashSystemPrompt(`sql:${context.lensSlug ?? 'default'}:${queryResult.rowCount}`);
    const dataSummary = JSON.stringify(queryResult.rows.slice(0, 3));
    const cachedNarrative = getFromLLMCache(tenantId, narrativePromptKey, message + dataSummary, context.history);

    if (cachedNarrative) {
      narrativeText = cachedNarrative.content;
      narrativeSections = JSON.parse(cachedNarrative.model) as PipelineOutput['sections']; // stash sections in model field
      console.log('[semantic] Narrative served from LLM cache');
    } else {
      try {
        const useFast = shouldSkipExpensiveOp(startMs, 20_000);
        if (useFast) console.log(`[semantic] Using fast narrative model for SQL mode (${remainingMs(startMs)}ms remaining)`);
        const narrativeResult = await generateNarrative(queryResult, intent, message, context, {
          lensSlug: context.lensSlug,
          lensPromptFragment,
          fast: useFast,
          timeoutMs: Math.max(5_000, remainingMs(startMs) - 2_000),
        });
        narrativeText = narrativeResult.text;
        narrativeSections = narrativeResult.sections;
        narrativeTokensIn = narrativeResult.tokensInput;
        narrativeTokensOut = narrativeResult.tokensOutput;

        // Cache the narrative response for future identical questions
        setInLLMCache(tenantId, narrativePromptKey, message + dataSummary, context.history, {
          content: narrativeResult.text,
          tokensInput: narrativeResult.tokensInput,
          tokensOutput: narrativeResult.tokensOutput,
          model: JSON.stringify(narrativeResult.sections), // stash sections in model field
          provider: intent.provider,
          latencyMs: 0,
        });
      } catch (narrativeErr) {
        console.warn('[semantic] Narrative generation failed (SQL mode), using data-aware fallback:', narrativeErr instanceof Error ? narrativeErr.message : narrativeErr);
        // Use data-aware fallback when we have rows, empty fallback when we don't
        const fallback = queryResult.rowCount > 0
          ? buildDataFallbackNarrative(message, queryResult)
          : buildEmptyResultNarrative(message, context);
        narrativeText = fallback.text;
        narrativeSections = fallback.sections;
      }
    }
  }

  // ── Follow-ups & chart config ────────────────────────────────
  // SQL mode has no compiled query, so chart config is null
  const suggestedFollowUps = generateFollowUps(message, intent.plan, narrativeSections, context);
  const chartConfig = null;

  // ── Data quality scoring ───────────────────────────────────
  const dataQuality = scoreDataQuality({
    rowCount: queryResult.rowCount,
    executionTimeMs: queryResult.executionTimeMs,
    dateRange: intent.plan.dateRange ?? undefined,
    compiledSql: validatedSql,
    compilationErrors: [],
    llmConfidence: intent.confidence,
    schemaTablesUsed: tablesAccessed,
  });

  // ── Eval capture ──────────────────────────────────────────────
  const resultSample = queryResult.rows.slice(0, 5);
  evalTurnId = generateUlid();
  void captureEvalTurnBestEffort({
    id: evalTurnId, message, context, intent,
    compiledSql: validatedSql, compilationErrors: [],
    tablesAccessed, executionTimeMs: queryResult.executionTimeMs,
    rowCount: queryResult.rowCount, resultSample,
    executionError: null, cacheStatus,
    narrative: narrativeText,
    responseSections: narrativeSections.map((s) => s.type),
  });

  const totalLatencyMs = Date.now() - startMs;
  recordSemanticRequest({
    tenantId,
    latencyMs: totalLatencyMs,
    llmLatencyMs: intent.latencyMs + sqlResult.latencyMs,
    executionTimeMs: queryResult.executionTimeMs,
    tokensInput: totalTokensIn + narrativeTokensIn,
    tokensOutput: totalTokensOut + narrativeTokensOut,
    cacheStatus,
    hadError: false,
    isClarification: false,
  });

  return {
    mode: 'sql',
    narrative: narrativeText,
    sections: narrativeSections,
    data: queryResult,
    plan: intent.plan,
    isClarification: false,
    clarificationText: null,
    evalTurnId,
    llmConfidence: intent.confidence,
    llmLatencyMs: intent.latencyMs + sqlResult.latencyMs,
    executionTimeMs: queryResult.executionTimeMs,
    tokensInput: totalTokensIn + narrativeTokensIn,
    tokensOutput: totalTokensOut + narrativeTokensOut,
    provider: intent.provider,
    model: intent.model,
    compiledSql: validatedSql,
    compilationErrors: [],
    tablesAccessed,
    cacheStatus,
    sqlExplanation: sqlResult.explanation,
    suggestedFollowUps,
    chartConfig,
    dataQuality,
  };
}

// ── Helpers ──────────────────────────────────────────────────────

/** Extract table names from SQL for observability */
function extractTablesFromSql(sql: string): string[] {
  const tables = new Set<string>();
  for (const m of sql.matchAll(/\bFROM\s+([a-z_][a-z0-9_]*)/gi)) {
    tables.add(m[1]!.toLowerCase());
  }
  for (const m of sql.matchAll(/\bJOIN\s+([a-z_][a-z0-9_]*)/gi)) {
    tables.add(m[1]!.toLowerCase());
  }
  return Array.from(tables);
}

/** Safe wrapper for ADVISOR MODE narrative generation */
async function safeAdvisorNarrative(
  skipNarrative: boolean,
  intent: Awaited<ReturnType<typeof resolveIntent>>,
  message: string,
  context: PipelineInput['context'],
  lensPromptFragment: string | null,
  startMs?: number,
): Promise<{
  text: string | null;
  sections: PipelineOutput['sections'];
  sectionTypes: string[];
  tokensIn: number;
  tokensOut: number;
}> {
  if (skipNarrative) {
    return { text: null, sections: [], sectionTypes: [], tokensIn: 0, tokensOut: 0 };
  }

  const useFast = startMs != null && shouldSkipExpensiveOp(startMs, 20_000);
  if (useFast) console.log(`[semantic] Using fast advisor narrative (${remainingMs(startMs!)}ms remaining)`);

  try {
    const result = await generateNarrative(null, intent, message, context, {
      lensSlug: context.lensSlug,
      lensPromptFragment,
      fast: useFast,
      ...(startMs != null ? { timeoutMs: Math.max(5_000, remainingMs(startMs) - 2_000) } : {}),
    });
    return {
      text: result.text,
      sections: result.sections,
      sectionTypes: result.sections.map((s) => s.type),
      tokensIn: result.tokensInput,
      tokensOut: result.tokensOutput,
    };
  } catch {
    const fallback = buildEmptyResultNarrative(message, context);
    return {
      text: fallback.text,
      sections: fallback.sections,
      sectionTypes: fallback.sections.map((s) => s.type),
      tokensIn: 0,
      tokensOut: 0,
    };
  }
}

// ── Eval capture (fire-and-forget) ────────────────────────────────

interface CaptureArgs {
  id: string; // pre-generated ULID for fire-and-forget
  message: string;
  context: PipelineInput['context'];
  intent: Awaited<ReturnType<typeof resolveIntent>>;
  compiledSql: string | null;
  compilationErrors: string[];
  tablesAccessed: string[];
  executionTimeMs: number | null;
  rowCount: number | null;
  resultSample: Record<string, unknown>[] | null;
  executionError: string | null;
  cacheStatus: string;
  narrative: string | null;
  responseSections: string[];
}

async function captureEvalTurnBestEffort(args: CaptureArgs): Promise<void> {
  try {
    const captureService = getEvalCaptureService();
    await captureService.recordTurn({
      id: args.id,
      tenantId: args.context.tenantId,
      userId: args.context.userId,
      userRole: args.context.userRole,
      sessionId: args.context.sessionId,
      turnNumber: 1, // pipeline doesn't track turn numbers — callers increment
      userMessage: args.message,
      context: {
        locationId: args.context.locationId ?? null,
        lensSlug: args.context.lensSlug ?? null,
        currentDate: args.context.currentDate,
      },
      llmResponse: {
        plan: args.intent.plan as unknown as Record<string, unknown>,
        rationale: {
          intent: args.intent.plan.intent,
          confidence: args.intent.confidence,
        },
        clarificationNeeded: args.intent.isClarification,
        clarificationMessage: args.intent.clarificationText,
        confidence: args.intent.confidence,
      },
      llmProvider: args.intent.provider,
      llmModel: args.intent.model,
      llmTokens: {
        input: args.intent.tokensInput,
        output: args.intent.tokensOutput,
      },
      llmLatencyMs: args.intent.latencyMs,
      compiledSql: args.compiledSql ?? undefined,
      compilationErrors: args.compilationErrors,
      tablesAccessed: args.tablesAccessed,
      executionTimeMs: args.executionTimeMs ?? undefined,
      rowCount: args.rowCount ?? undefined,
      resultSample: args.resultSample ?? undefined,
      executionError: args.executionError ?? undefined,
      cacheStatus: args.cacheStatus,
      narrative: args.narrative ?? undefined,
      responseSections: args.responseSections,
    });
  } catch (err) {
    // Never let capture errors surface to the user
    console.warn('[semantic] Eval capture failed (non-blocking):', err instanceof Error ? err.message : err);
  }
}
