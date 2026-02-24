import type { LLMAdapter, LLMMessage, IntentContext } from './types';
import { LLMError } from './types';
import { getLLMAdapter } from './adapters/anthropic';

// ── SQL Auto-Correction Retry ───────────────────────────────────
// When LLM-generated SQL fails execution or validation, this module
// sends the error back to the LLM and asks it to produce a corrected
// query. Limited to a small number of retries to control latency and
// token spend.

// ── Types ────────────────────────────────────────────────────────

export interface SqlRetryResult {
  correctedSql: string;
  explanation: string;
  confidence: number;
  tokensInput: number;
  tokensOutput: number;
  latencyMs: number;
  retryCount: number;
}

export interface SqlRetryOptions {
  /** Maximum number of retry attempts. Default: 1 (only retry once). */
  maxRetries?: number;
  /** Override the default LLM adapter. */
  adapter?: LLMAdapter;
  /** Schema catalog text so the LLM knows available tables/columns. */
  schemaContext?: string;
}

export interface RetryParams {
  originalQuestion: string;
  failedSql: string;
  errorMessage: string;
  context: IntentContext;
  options?: SqlRetryOptions;
}

// ── System prompt builder ────────────────────────────────────────

function buildRetrySystemPrompt(schemaContext?: string): string {
  return `You are an expert PostgreSQL query debugger. A previous SQL query failed with an error.

## Your Task
Fix the SQL query based on the error message. Return ONLY a corrected query.

## CRITICAL RULES
1. SELECT only. Never INSERT/UPDATE/DELETE/CREATE/ALTER/DROP.
2. Always include WHERE tenant_id = $1 in the main query and subqueries.
3. Always include LIMIT (max 500). Exception: aggregate queries (COUNT/SUM/AVG) that return a single row.
4. No semicolons at the end.
5. No SQL comments.

## Common Fixes
- Column not found → check table schema, use correct column name
- Table not found → check available tables
- Ambiguous column → add table alias prefix
- Type mismatch → add explicit CAST
- Syntax error → fix SQL grammar
- Division by zero → add NULLIF or CASE WHEN

${schemaContext ? '## Available Tables\n' + schemaContext : ''}

## Output Format
Respond with a JSON object only, no markdown fences:
{"sql": "corrected SQL here", "explanation": "what was wrong and how it was fixed", "confidence": 0.0-1.0}`;
}

// ── User message builder ─────────────────────────────────────────

function buildRetryUserMessage(
  originalQuestion: string,
  failedSql: string,
  errorMessage: string,
): string {
  return `Original question: "${originalQuestion}"

Failed SQL:
${failedSql}

Error:
${errorMessage}

Fix the SQL and return the corrected version as JSON.`;
}

// ── JSON parser ──────────────────────────────────────────────────

interface RawRetryResponse {
  sql: string;
  explanation: string;
  confidence: number;
}

function parseRetryResponse(raw: string): RawRetryResponse {
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
      `SQL retry returned non-JSON: ${cleaned.slice(0, 200)}`,
      'PARSE_ERROR',
    );
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new LLMError('SQL retry response is not an object', 'PARSE_ERROR');
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.sql !== 'string' || !obj.sql.trim()) {
    throw new LLMError('SQL retry response missing sql field', 'PARSE_ERROR');
  }

  return {
    sql: obj.sql.trim(),
    explanation: typeof obj.explanation === 'string' ? obj.explanation : '',
    confidence: typeof obj.confidence === 'number'
      ? Math.min(1, Math.max(0, obj.confidence))
      : 0.5,
  };
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Attempts to auto-correct a failed SQL query by sending the error
 * back to the LLM for a revised version.
 *
 * This function will retry up to `options.maxRetries` times (default 1).
 * Each attempt sends the most recent failed SQL and error to the LLM.
 * Token counts and latency are accumulated across all retry attempts.
 *
 * @throws {LLMError} if the LLM response cannot be parsed after all retries
 * @throws {LLMError} if the LLM provider returns an error on every attempt
 */
export async function retrySqlGeneration(
  params: RetryParams,
): Promise<SqlRetryResult> {
  const {
    originalQuestion,
    failedSql,
    errorMessage,
    options,
  } = params;

  const maxRetries = options?.maxRetries ?? 1;
  const llm = options?.adapter ?? getLLMAdapter();
  const schemaContext = options?.schemaContext;

  const systemPrompt = buildRetrySystemPrompt(schemaContext);

  let currentFailedSql = failedSql;
  let currentError = errorMessage;
  let cumulativeTokensInput = 0;
  let cumulativeTokensOutput = 0;
  let cumulativeLatencyMs = 0;
  let lastLlmError: LLMError | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const userMessage = buildRetryUserMessage(
      originalQuestion,
      currentFailedSql,
      currentError,
    );

    const messages: LLMMessage[] = [
      { role: 'user', content: userMessage },
    ];

    const startMs = Date.now();
    let response;
    try {
      response = await llm.complete(messages, {
        systemPrompt,
        temperature: 0,
        maxTokens: 2048,
      });
    } catch (err) {
      lastLlmError = err instanceof LLMError
        ? err
        : new LLMError(`LLM call failed during retry: ${String(err)}`, 'PROVIDER_ERROR');
      // If this was not the last attempt, continue to next retry
      if (attempt < maxRetries) continue;
      throw lastLlmError;
    }

    const latencyMs = Date.now() - startMs;
    cumulativeTokensInput += response.tokensInput;
    cumulativeTokensOutput += response.tokensOutput;
    cumulativeLatencyMs += latencyMs;

    try {
      const parsed = parseRetryResponse(response.content);

      return {
        correctedSql: parsed.sql,
        explanation: parsed.explanation,
        confidence: parsed.confidence,
        tokensInput: cumulativeTokensInput,
        tokensOutput: cumulativeTokensOutput,
        latencyMs: cumulativeLatencyMs,
        retryCount: attempt,
      };
    } catch (parseErr) {
      // If parsing fails and we have more retries, feed the parse error back
      // as the new error for the next attempt
      if (attempt < maxRetries) {
        currentFailedSql = response.content.slice(0, 500);
        currentError = `Previous retry response was not valid JSON: ${String(parseErr)}`;
        continue;
      }
      // Last attempt — re-throw the parse error
      throw parseErr;
    }
  }

  // Should not be reached, but satisfies TypeScript
  throw lastLlmError ?? new LLMError(
    'SQL retry exhausted all attempts without a result',
    'PROVIDER_ERROR',
  );
}
