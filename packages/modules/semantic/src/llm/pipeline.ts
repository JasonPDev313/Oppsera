import type { PipelineInput, PipelineOutput } from './types';
import { resolveIntent } from './intent-resolver';
import { executeCompiledQuery } from './executor';
import { generateNarrative, buildEmptyResultNarrative } from './narrative';
import { compilePlan } from '../compiler/compiler';
import { buildRegistryCatalog, getLens } from '../registry/registry';
import { getEvalCaptureService } from '../evaluation/capture';
import { setEvalCaptureService } from '../evaluation/capture';
import { getLLMAdapter, setLLMAdapter } from './adapters/anthropic';
import type { LLMAdapter } from './types';
import { getFromQueryCache, setInQueryCache } from '../cache/query-cache';
import { recordSemanticRequest } from '../observability/metrics';
import { generateUlid } from '@oppsera/shared';

export { getLLMAdapter, setLLMAdapter };

// ── Pipeline ──────────────────────────────────────────────────────
// Orchestrates: intent resolution → compilation → execution → narrative
// Captures an EvalTurn after completion (best-effort, never blocks response).

export async function runPipeline(input: PipelineInput): Promise<PipelineOutput> {
  const { message, context, examples = [], skipNarrative = false } = input;
  const { tenantId, lensSlug } = context;

  const startMs = Date.now();
  let evalTurnId: string | null = null;

  // ── 1. Load registry catalog ──────────────────────────────────
  console.log('[semantic] Pipeline start — loading registry...');
  const lens = lensSlug ? await getLens(lensSlug, tenantId) : null;
  const domain = lens?.domain;

  const catalog = await buildRegistryCatalog(domain);
  console.log(`[semantic] Registry loaded in ${Date.now() - startMs}ms (${catalog.metrics.length} metrics, ${catalog.dimensions.length} dims)`);

  const lensPromptFragment = lens?.systemPromptFragment ?? null;

  // ── 2. Intent resolution ──────────────────────────────────────
  console.log('[semantic] Resolving intent via LLM...');
  const intentStart = Date.now();
  let intent;
  try {
    intent = await resolveIntent(message, context, {
      catalog,
      examples,
      lensPromptFragment,
    });
    console.log(`[semantic] Intent resolved in ${Date.now() - intentStart}ms (clarification=${intent.isClarification}, confidence=${intent.confidence})`);
  } catch (err) {
    console.error(`[semantic] Intent resolution FAILED in ${Date.now() - intentStart}ms:`, err);
    // LLM failure — return an error pipeline output without crashing
    return {
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

  // ── 4. Compilation ────────────────────────────────────────────
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
      compilationErrors = compiled.warnings; // treat warnings as soft errors
    }
  } catch (err) {
    const errMsg = String(err);
    compilationErrors = [errMsg];

    // Attempt ADVISOR MODE narrative even on compilation failure
    let advisorNarrative: string | null = null;
    let advisorSections: PipelineOutput['sections'] = [];
    let advisorTokensIn = 0;
    let advisorTokensOut = 0;

    if (!skipNarrative) {
      try {
        const advisorResult = await generateNarrative(null, intent, message, context, {
          lensSlug: context.lensSlug,
          lensPromptFragment,
        });
        advisorNarrative = advisorResult.text;
        advisorSections = advisorResult.sections;
        advisorTokensIn = advisorResult.tokensInput;
        advisorTokensOut = advisorResult.tokensOutput;
      } catch {
        // If narrative also fails, fall back to static text
        const fallback = buildEmptyResultNarrative(message, context);
        advisorNarrative = fallback.text;
        advisorSections = fallback.sections;
      }
    }

    evalTurnId = generateUlid();
    void captureEvalTurnBestEffort({
      id: evalTurnId,
      message,
      context,
      intent,
      compiledSql: null,
      compilationErrors,
      tablesAccessed: [],
      executionTimeMs: null,
      rowCount: null,
      resultSample: null,
      executionError: errMsg,
      cacheStatus: 'MISS',
      narrative: advisorNarrative,
      responseSections: advisorSections.map((s) => s.type),
    });

    return {
      narrative: advisorNarrative,
      sections: advisorSections,
      data: null,
      plan: intent.plan,
      isClarification: false,
      clarificationText: null,
      evalTurnId,
      llmConfidence: intent.confidence,
      llmLatencyMs: intent.latencyMs,
      executionTimeMs: null,
      tokensInput: intent.tokensInput + advisorTokensIn,
      tokensOutput: intent.tokensOutput + advisorTokensOut,
      provider: intent.provider,
      model: intent.model,
      compiledSql: null,
      compilationErrors,
      tablesAccessed: [],
      cacheStatus: 'MISS',
    };
  }

  // ── 5. Execution (with query cache) ───────────────────────────
  let queryResult;
  let executionError: string | null = null;
  let cacheStatus: PipelineOutput['cacheStatus'] = 'MISS';

  // Check query cache before hitting the DB
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
      // Cache the result for subsequent identical queries
      setInQueryCache(tenantId, compiled.sql, compiled.params, queryResult.rows, queryResult.rowCount);
    } catch (err) {
      executionError = String(err);

      // Attempt ADVISOR MODE narrative on execution failure (same as compilation errors)
      let advisorNarrative: string | null = null;
      let advisorSections: PipelineOutput['sections'] = [];
      let advisorTokensIn = 0;
      let advisorTokensOut = 0;

      if (!skipNarrative) {
        try {
          const advisorResult = await generateNarrative(null, intent, message, context, {
            lensSlug: context.lensSlug,
            lensPromptFragment,
          });
          advisorNarrative = advisorResult.text;
          advisorSections = advisorResult.sections;
          advisorTokensIn = advisorResult.tokensInput;
          advisorTokensOut = advisorResult.tokensOutput;
        } catch {
          const fallback = buildEmptyResultNarrative(message, context);
          advisorNarrative = fallback.text;
          advisorSections = fallback.sections;
        }
      }

      evalTurnId = generateUlid();
      void captureEvalTurnBestEffort({
        id: evalTurnId,
        message,
        context,
        intent,
        compiledSql,
        compilationErrors,
        tablesAccessed,
        executionTimeMs: null,
        rowCount: null,
        resultSample: null,
        executionError,
        cacheStatus: 'MISS',
        narrative: advisorNarrative,
        responseSections: advisorSections.map((s) => s.type),
      });

      return {
        narrative: advisorNarrative,
        sections: advisorSections,
        data: null,
        plan: intent.plan,
        isClarification: false,
        clarificationText: null,
        evalTurnId,
        llmConfidence: intent.confidence,
        llmLatencyMs: intent.latencyMs,
        executionTimeMs: null,
        tokensInput: intent.tokensInput + advisorTokensIn,
        tokensOutput: intent.tokensOutput + advisorTokensOut,
        provider: intent.provider,
        model: intent.model,
        compiledSql,
        compilationErrors: [executionError],
        tablesAccessed,
        cacheStatus: 'MISS',
      };
    }
  }

  // ── 6. Narrative ──────────────────────────────────────────────
  // Always call LLM for narrative — even for 0-row results (ADVISOR MODE).
  // buildEmptyResultNarrative is only used as a fallback if the LLM call fails.
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
      // Fallback: static narrative if LLM fails
      const fallback = buildEmptyResultNarrative(message, context);
      narrativeText = fallback.text;
      narrativeSections = fallback.sections;
    }
  }

  // ── 7. Eval capture (fire-and-forget — never blocks response) ──
  const resultSample = queryResult.rows.slice(0, 5);

  evalTurnId = generateUlid();
  void captureEvalTurnBestEffort({
    id: evalTurnId,
    message,
    context,
    intent,
    compiledSql,
    compilationErrors,
    tablesAccessed,
    executionTimeMs: queryResult.executionTimeMs,
    rowCount: queryResult.rowCount,
    resultSample,
    executionError: null,
    cacheStatus,
    narrative: narrativeText,
    responseSections: narrativeSections.map((s) => s.type),
  });

  const totalLatencyMs = Date.now() - startMs;

  // Record observability metrics (best-effort)
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
