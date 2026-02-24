import type { PipelineInput, PipelineOutput, QueryResult } from './types';
import { resolveIntent } from './intent-resolver';
import { executeCompiledQuery } from './executor';
import { generateNarrative, buildEmptyResultNarrative } from './narrative';
import { generateSql } from './sql-generator';
import { validateGeneratedSql } from './sql-validator';
import { executeSqlQuery } from './sql-executor';
import { compilePlan } from '../compiler/compiler';
import { buildRegistryCatalog, getLens } from '../registry/registry';
import { buildSchemaCatalog } from '../schema/schema-catalog';
import { getEvalCaptureService } from '../evaluation/capture';
import { setEvalCaptureService } from '../evaluation/capture';
import { getLLMAdapter, setLLMAdapter } from './adapters/anthropic';
import type { LLMAdapter } from './types';
import { getFromQueryCache, setInQueryCache } from '../cache/query-cache';
import { recordSemanticRequest } from '../observability/metrics';
import { generateUlid } from '@oppsera/shared';

export { getLLMAdapter, setLLMAdapter };

// ── Pipeline ──────────────────────────────────────────────────────
// Orchestrates: intent resolution → compilation/sql-gen → execution → narrative
// Two modes:
//   Mode A (metrics): intent → compile → execute → narrate
//   Mode B (sql):     intent → generate SQL → validate → execute → narrate
// Captures an EvalTurn after completion (best-effort, never blocks response).

export async function runPipeline(input: PipelineInput): Promise<PipelineOutput> {
  const { message, context, examples = [], skipNarrative = false } = input;
  const { tenantId, lensSlug } = context;

  const startMs = Date.now();
  let evalTurnId: string | null = null;

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
  } catch (err) {
    console.error(`[semantic] Intent resolution FAILED in ${Date.now() - intentStart}ms:`, err);
    return {
      mode: 'metrics',
      narrative: null,
      sections: [],
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
      compilationErrors: [String(err)],
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
  if (intent.mode === 'sql' && schemaCatalog) {
    return runSqlMode(input, intent, schemaCatalog, lensPromptFragment, startMs);
  }

  // Fall through to metrics mode (Mode A) — also used when schema catalog is unavailable
  return runMetricsMode(input, intent, lensPromptFragment, startMs);
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

    const advisor = await safeAdvisorNarrative(skipNarrative, intent, message, context, lensPromptFragment);

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

      const advisor = await safeAdvisorNarrative(skipNarrative, intent, message, context, lensPromptFragment);

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

  // ── Narrative ──────────────────────────────────────────────────
  let narrativeText: string | null = null;
  let narrativeSections: PipelineOutput['sections'] = [];
  let narrativeTokensIn = 0;
  let narrativeTokensOut = 0;

  if (!skipNarrative) {
    try {
      const narrativeResult = await generateNarrative(queryResult, intent, message, context, {
        lensSlug: context.lensSlug,
        lensPromptFragment,
        metricDefs: compiled.metaDefs,
        dimensionDefs: compiled.dimensionDefs,
      });
      narrativeText = narrativeResult.text;
      narrativeSections = narrativeResult.sections;
      narrativeTokensIn = narrativeResult.tokensInput;
      narrativeTokensOut = narrativeResult.tokensOutput;
    } catch {
      const fallback = buildEmptyResultNarrative(message, context);
      narrativeText = fallback.text;
      narrativeSections = fallback.sections;
    }
  }

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

    const advisor = await safeAdvisorNarrative(skipNarrative, intent, message, context, lensPromptFragment);

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

    const advisor = await safeAdvisorNarrative(skipNarrative, intent, message, context, lensPromptFragment);

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

  const validatedSql = validation.sanitizedSql;

  // ── Execution (with query cache) ──────────────────────────────
  let queryResult: QueryResult;
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

      const advisor = await safeAdvisorNarrative(skipNarrative, intent, message, context, lensPromptFragment);

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

  const tablesAccessed = extractTablesFromSql(validatedSql);

  // ── Narrative ──────────────────────────────────────────────────
  let narrativeText: string | null = null;
  let narrativeSections: PipelineOutput['sections'] = [];
  let narrativeTokensIn = 0;
  let narrativeTokensOut = 0;

  if (!skipNarrative) {
    try {
      const narrativeResult = await generateNarrative(queryResult, intent, message, context, {
        lensSlug: context.lensSlug,
        lensPromptFragment,
      });
      narrativeText = narrativeResult.text;
      narrativeSections = narrativeResult.sections;
      narrativeTokensIn = narrativeResult.tokensInput;
      narrativeTokensOut = narrativeResult.tokensOutput;
    } catch {
      const fallback = buildEmptyResultNarrative(message, context);
      narrativeText = fallback.text;
      narrativeSections = fallback.sections;
    }
  }

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

  try {
    const result = await generateNarrative(null, intent, message, context, {
      lensSlug: context.lensSlug,
      lensPromptFragment,
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
