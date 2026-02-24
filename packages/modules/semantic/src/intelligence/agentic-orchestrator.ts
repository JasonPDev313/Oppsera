// ── Agentic Orchestrator ──────────────────────────────────────────
// Multi-step analysis engine that autonomously decomposes complex
// business questions into 2-5 sub-queries, executes them, and
// synthesizes a final answer. Implements a Think → Act → Observe
// loop with strict safety guardrails (SELECT-only, tenant isolation,
// step limit, total timeout).

import { getLLMAdapter } from '../llm/adapters/anthropic';
import { validateGeneratedSql } from '../llm/sql-validator';
import { executeSqlQuery } from '../llm/sql-executor';
import type {
  LLMMessage,
  LLMAdapter,
  IntentContext,
  QueryResult,
} from '../llm/types';
import { LLMError } from '../llm/types';
import type { SchemaCatalog } from '../schema/schema-catalog';
import type { RegistryCatalog } from '../registry/types';

// ── Types ──────────────────────────────────────────────────────────

/** Extended context for agentic analysis. */
export interface AgenticContext extends IntentContext {
  /** Maximum number of Think-Act-Observe steps (default 5). */
  maxSteps?: number;
  /** Full database schema catalog for SQL generation. */
  schemaCatalog: SchemaCatalog;
  /** Semantic registry catalog for metric awareness. */
  registryCatalog: RegistryCatalog;
  /** Optional LLM adapter override (for testing). */
  adapter?: LLMAdapter;
}

/** A single step in the agentic analysis. */
export interface AnalysisStep {
  /** Step sequence number (1-based). */
  stepNumber: number;
  /** The LLM's reasoning about what to investigate next. */
  thought: string;
  /** The type of action taken in this step. */
  action: 'query' | 'analyze' | 'compare';
  /** The SQL query generated for this step (null for analyze/compare actions). */
  query: string | null;
  /** The query result data (null if query failed or action is analyze/compare). */
  result: QueryResult | null;
  /** The insight derived from this step's observation. */
  insight: string;
}

/** The final output of an agentic analysis run. */
export interface AgenticResult {
  /** All executed analysis steps. */
  steps: AnalysisStep[];
  /** The synthesized final answer combining all step insights. */
  finalAnswer: string;
  /** Total LLM tokens consumed across all steps. */
  totalTokens: number;
  /** Total wall-clock time in milliseconds. */
  totalLatencyMs: number;
  /** Number of steps actually executed. */
  stepCount: number;
}

// ── Constants ──────────────────────────────────────────────────────

const DEFAULT_MAX_STEPS = 5;
const TOTAL_TIMEOUT_MS = 30_000; // 30s hard ceiling
const PER_STEP_QUERY_TIMEOUT_MS = 10_000; // 10s per SQL execution
const MAX_RESULT_ROWS_PER_STEP = 50; // Keep step results small

// ── Decomposition prompt ───────────────────────────────────────────

function buildDecompositionPrompt(
  schemaCatalog: SchemaCatalog,
  registryCatalog: RegistryCatalog,
  context: AgenticContext,
): string {
  const metricSummary = registryCatalog.metrics
    .filter((m) => m.isActive)
    .map((m) => `- ${m.slug}: ${m.displayName} (${m.description ?? 'no description'})`)
    .join('\n');

  return `You are an analytical assistant for OppsEra, a multi-tenant SaaS ERP platform.

Your job: decompose a complex business question into 2-5 simpler sub-questions that
can each be answered by a single SQL query. You are conducting a multi-step investigation.

## Output Contract
Respond with a single JSON object — no markdown fences, no prose before/after:
{
  "steps": [
    {
      "thought": "I need to understand the baseline sales figures first",
      "subQuestion": "What are the total net sales for the last 7 days?",
      "action": "query"
    },
    {
      "thought": "Now I need to compare against the prior period",
      "subQuestion": "What were the total net sales for the 7 days before that?",
      "action": "query"
    },
    {
      "thought": "Let me find which items drove the difference",
      "subQuestion": "Which items had the biggest change in sales between these two periods?",
      "action": "compare"
    }
  ]
}

## Rules
1. Each step must have "thought", "subQuestion", and "action".
2. Action must be one of: "query" (needs SQL), "analyze" (interpret prior results), "compare" (cross-reference prior steps).
3. Minimum 2 steps, maximum ${context.maxSteps ?? DEFAULT_MAX_STEPS} steps.
4. Steps should build on each other — later steps can reference findings from earlier ones.
5. Keep sub-questions simple enough that a single SQL query can answer each one.
6. Always start with the most fundamental data point before drilling down.

## Available Metrics
${metricSummary}

## Database Tables (summary)
${schemaCatalog.summaryText}

## Context
- Current date: ${context.currentDate}
- Tenant: ${context.tenantId}
- User role: ${context.userRole}
${context.locationId ? `- Location: ${context.locationId}` : '- Scope: all locations'}`;
}

// ── SQL generation prompt per step ─────────────────────────────────

function buildStepSqlPrompt(
  schemaCatalog: SchemaCatalog,
  context: AgenticContext,
  subQuestion: string,
  priorInsights: string[],
): string {
  const priorSection = priorInsights.length > 0
    ? `\n## Prior Findings\n${priorInsights.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n`
    : '';

  return `You are an expert PostgreSQL query generator for OppsEra, a multi-tenant SaaS ERP.

Generate a single SELECT query to answer the sub-question below.
${priorSection}
## Output Contract
Respond with a single JSON object:
{ "sql": "SELECT ... WHERE tenant_id = $1 ...", "explanation": "brief description" }

## CRITICAL RULES
1. SELECT only. No INSERT, UPDATE, DELETE, CREATE, ALTER, DROP.
2. Always include WHERE tenant_id = $1 in the main query and all subqueries.
3. Always include LIMIT (max ${MAX_RESULT_ROWS_PER_STEP}).
4. Use only tables from the schema below.
5. Column names are snake_case.
6. No semicolons, no SQL comments.
7. For orders/tenders: amounts are in CENTS — divide by 100.0 for dollars.
8. For rm_daily_sales/rm_item_sales: amounts are in DOLLARS (no conversion).
9. For date filtering on orders, use business_date (not created_at).
10. Active orders: status IN ('placed', 'paid'). Active tenders: status = 'captured'.
11. Active catalog items: archived_at IS NULL.

## Context
- Current date: ${context.currentDate}
- Tenant: ${context.tenantId}
${context.locationId ? `- Location: ${context.locationId}` : '- Scope: all locations'}

## Database Schema
${schemaCatalog.fullText}`;
}

// ── Synthesis prompt ───────────────────────────────────────────────

function buildSynthesisPrompt(
  steps: AnalysisStep[],
  originalQuestion: string,
): string {
  const stepSummaries = steps.map((s) => {
    const resultSummary = s.result
      ? `Returned ${s.result.rowCount} rows. Sample: ${JSON.stringify(s.result.rows.slice(0, 3))}`
      : 'No data returned.';
    return `### Step ${s.stepNumber}: ${s.thought}\n**Action**: ${s.action}\n**Insight**: ${s.insight}\n**Data**: ${resultSummary}`;
  }).join('\n\n');

  return `You are THE OPPS ERA LENS advisor. Synthesize the findings from a multi-step analysis
into a clear, actionable final answer.

## Original Question
${originalQuestion}

## Analysis Steps
${stepSummaries}

## Instructions
1. Start with a direct answer to the original question.
2. Support with specific numbers from the analysis steps.
3. Provide 2-3 actionable recommendations based on the findings.
4. Keep the response under 400 words.
5. Use markdown formatting.
6. If steps produced conflicting data, acknowledge the uncertainty.

Respond in markdown only.`;
}

// ── JSON parsers ───────────────────────────────────────────────────

interface DecomposedStep {
  thought: string;
  subQuestion: string;
  action: 'query' | 'analyze' | 'compare';
}

function parseDecomposition(raw: string): DecomposedStep[] {
  let cleaned = raw.trim();

  // Strip markdown fences
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  }

  // Extract JSON from surrounding prose
  if (!cleaned.startsWith('{')) {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new LLMError(
      `Agentic decomposition returned non-JSON: ${cleaned.slice(0, 200)}`,
      'PARSE_ERROR',
    );
  }

  if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as Record<string, unknown>).steps)) {
    throw new LLMError('Agentic decomposition missing steps array', 'PARSE_ERROR');
  }

  const obj = parsed as { steps: unknown[] };
  const steps: DecomposedStep[] = [];

  for (const step of obj.steps) {
    if (typeof step !== 'object' || step === null) continue;
    const s = step as Record<string, unknown>;
    const action = String(s.action ?? 'query');
    steps.push({
      thought: String(s.thought ?? ''),
      subQuestion: String(s.subQuestion ?? ''),
      action: action === 'analyze' ? 'analyze' : action === 'compare' ? 'compare' : 'query',
    });
  }

  return steps;
}

function parseStepSql(raw: string): { sql: string; explanation: string } {
  let cleaned = raw.trim();

  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  }

  if (!cleaned.startsWith('{')) {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new LLMError(
      `Step SQL response is not valid JSON: ${cleaned.slice(0, 200)}`,
      'PARSE_ERROR',
    );
  }

  const obj = parsed as Record<string, unknown>;
  return {
    sql: typeof obj.sql === 'string' ? obj.sql.trim() : '',
    explanation: typeof obj.explanation === 'string' ? obj.explanation : '',
  };
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Runs a multi-step agentic analysis on a complex business question.
 *
 * The orchestrator:
 * 1. Decomposes the question into 2-5 sub-questions via the LLM
 * 2. For each sub-question, generates and executes a SQL query
 * 3. Feeds intermediate results into subsequent steps for context
 * 4. Synthesizes all findings into a final answer
 *
 * Safety: max steps enforced, 30s total timeout, SELECT-only SQL
 * validation, tenant_id = $1 requirement on every generated query.
 *
 * @param tenantId - The tenant to scope all queries to
 * @param question - The complex business question to analyze
 * @param context - Agentic context with schema, registry, and limits
 * @returns AgenticResult with steps, final answer, and token usage
 */
export async function runAgenticAnalysis(
  tenantId: string,
  question: string,
  context: AgenticContext,
): Promise<AgenticResult> {
  const startMs = Date.now();
  const maxSteps = Math.min(context.maxSteps ?? DEFAULT_MAX_STEPS, DEFAULT_MAX_STEPS);
  const llm = context.adapter ?? getLLMAdapter();
  let totalTokens = 0;

  // ── Step 1: Decompose the question ────────────────────────────
  const decompositionSystemPrompt = buildDecompositionPrompt(
    context.schemaCatalog,
    context.registryCatalog,
    context,
  );

  const decompositionMessages: LLMMessage[] = [
    { role: 'user', content: question + '\n\nRespond ONLY with the JSON object. No prose.' },
  ];

  const decompositionResponse = await llm.complete(decompositionMessages, {
    systemPrompt: decompositionSystemPrompt,
    temperature: 0,
    maxTokens: 2048,
  });
  totalTokens += decompositionResponse.tokensInput + decompositionResponse.tokensOutput;

  const decomposedSteps = parseDecomposition(decompositionResponse.content);

  // Enforce step limits
  const stepsToRun = decomposedSteps.slice(0, maxSteps);
  if (stepsToRun.length < 2) {
    // LLM returned too few steps — add a synthesis step
    stepsToRun.push({
      thought: 'Synthesize findings from the previous step.',
      subQuestion: question,
      action: 'analyze',
    });
  }

  // ── Step 2: Execute each step (Think → Act → Observe) ─────────
  const completedSteps: AnalysisStep[] = [];
  const priorInsights: string[] = [];

  for (const [idx, decomposed] of stepsToRun.entries()) {
    // Check total timeout
    if (Date.now() - startMs > TOTAL_TIMEOUT_MS) {
      completedSteps.push({
        stepNumber: idx + 1,
        thought: decomposed.thought,
        action: decomposed.action,
        query: null,
        result: null,
        insight: 'Skipped — total analysis timeout reached.',
      });
      break;
    }

    if (decomposed.action === 'query') {
      // Generate SQL for this sub-question
      const stepSystemPrompt = buildStepSqlPrompt(
        context.schemaCatalog,
        context,
        decomposed.subQuestion,
        priorInsights,
      );

      let stepSql = '';
      let explanation = '';
      let queryResult: QueryResult | null = null;
      let insight = '';

      try {
        const sqlResponse = await llm.complete(
          [{ role: 'user', content: decomposed.subQuestion + '\n\nRespond ONLY with the JSON object.' }],
          { systemPrompt: stepSystemPrompt, temperature: 0, maxTokens: 2048 },
        );
        totalTokens += sqlResponse.tokensInput + sqlResponse.tokensOutput;

        const parsed = parseStepSql(sqlResponse.content);
        stepSql = parsed.sql;
        explanation = parsed.explanation;

        // Validate the generated SQL
        const validation = validateGeneratedSql(stepSql, context.schemaCatalog.tableNames);
        if (!validation.valid) {
          insight = `SQL validation failed: ${validation.errors.join('; ')}`;
        } else {
          // Execute the validated SQL
          queryResult = await executeSqlQuery(validation.sanitizedSql, {
            tenantId,
            timeoutMs: PER_STEP_QUERY_TIMEOUT_MS,
          });

          // Summarize the result as an insight
          if (queryResult.rowCount === 0) {
            insight = `${explanation} — No data returned.`;
          } else {
            const sampleRow = queryResult.rows[0];
            const keys = sampleRow ? Object.keys(sampleRow) : [];
            const sampleValues = sampleRow
              ? keys.map((k) => `${k}=${JSON.stringify(sampleRow[k])}`).join(', ')
              : '';
            insight = `${explanation} — ${queryResult.rowCount} row(s). Sample: ${sampleValues}`;
          }
        }
      } catch (err) {
        insight = `Query step failed: ${err instanceof Error ? err.message : String(err)}`;
      }

      completedSteps.push({
        stepNumber: idx + 1,
        thought: decomposed.thought,
        action: 'query',
        query: stepSql,
        result: queryResult,
        insight,
      });
    } else {
      // analyze or compare — synthesize from prior steps without a new query
      const priorDataSummary = completedSteps
        .filter((s) => s.result != null)
        .map((s) => `Step ${s.stepNumber}: ${s.insight}`)
        .join('\n');

      let insight: string;
      try {
        const analyzeResponse = await llm.complete(
          [{
            role: 'user',
            content: `Based on these prior findings:\n${priorDataSummary}\n\nAnswer: ${decomposed.subQuestion}\n\nProvide a concise insight in 1-2 sentences.`,
          }],
          {
            systemPrompt: 'You are a concise data analyst. Answer based only on the provided findings.',
            temperature: 0.2,
            maxTokens: 512,
          },
        );
        totalTokens += analyzeResponse.tokensInput + analyzeResponse.tokensOutput;
        insight = analyzeResponse.content.trim();
      } catch (err) {
        insight = `Analysis failed: ${err instanceof Error ? err.message : String(err)}`;
      }

      completedSteps.push({
        stepNumber: idx + 1,
        thought: decomposed.thought,
        action: decomposed.action,
        query: null,
        result: null,
        insight,
      });
    }

    priorInsights.push(completedSteps[completedSteps.length - 1]!.insight);
  }

  // ── Step 3: Synthesize final answer ───────────────────────────
  let finalAnswer: string;
  try {
    const synthesisPrompt = buildSynthesisPrompt(completedSteps, question);
    const synthesisResponse = await llm.complete(
      [{ role: 'user', content: synthesisPrompt }],
      {
        systemPrompt: 'You are THE OPPS ERA LENS advisor. Provide clear, actionable business insights. Respond in markdown.',
        temperature: 0.3,
        maxTokens: 2048,
      },
    );
    totalTokens += synthesisResponse.tokensInput + synthesisResponse.tokensOutput;
    finalAnswer = synthesisResponse.content;
  } catch (err) {
    // Fallback: concatenate step insights
    finalAnswer = completedSteps.map((s) =>
      `**Step ${s.stepNumber}**: ${s.insight}`,
    ).join('\n\n');
    finalAnswer += '\n\n*Synthesis failed — showing raw step insights.*';
  }

  const totalLatencyMs = Date.now() - startMs;

  return {
    steps: completedSteps,
    finalAnswer,
    totalTokens,
    totalLatencyMs,
    stepCount: completedSteps.length,
  };
}
