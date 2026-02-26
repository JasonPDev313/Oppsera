import type { QueryPlan } from '../compiler/types';
import type { EvalExample } from '../evaluation/types';

// ── LLM adapter interface ─────────────────────────────────────────
// Abstraction over different LLM providers (Anthropic, OpenAI, etc.)
// The adapter is swappable — tests use a MockLLMAdapter.

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LLMResponse {
  content: string;
  tokensInput: number;
  tokensOutput: number;
  model: string;
  provider: string;
  latencyMs: number;
  stopReason: 'end_turn' | 'max_tokens' | 'stop_sequence' | string;
}

export interface LLMAdapter {
  complete(messages: LLMMessage[], options?: LLMCompletionOptions): Promise<LLMResponse>;
  provider: string;
  model: string;
}

export interface LLMCompletionOptions {
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  stopSequences?: string[];
  /** Override the adapter's default model for this call (e.g. use Haiku for structured JSON output) */
  model?: string;
  /** Override the default timeout (ms) for this specific call. Useful when pipeline time budget is tight. */
  timeoutMs?: number;
}

// ── Intent resolution types ───────────────────────────────────────

export interface IntentContext {
  tenantId: string;
  locationId?: string;
  userId: string;
  userRole: string;
  sessionId: string;
  lensSlug?: string;
  // Conversation history for multi-turn context
  history?: LLMMessage[];
  // Current date in tenant timezone (for relative date resolution)
  currentDate: string;
  timezone?: string;
}

export type PipelineMode = 'metrics' | 'sql';

export interface ResolvedIntent {
  mode: PipelineMode;          // 'metrics' for registry-based, 'sql' for direct SQL
  plan: QueryPlan;
  confidence: number;          // 0–1, LLM's self-reported confidence
  isClarification: boolean;    // true if LLM asked a question instead of planning
  clarificationText?: string;  // the clarification question
  rawResponse: string;         // raw LLM JSON output
  tokensInput: number;
  tokensOutput: number;
  latencyMs: number;
  provider: string;
  model: string;
}

// ── Execution types ───────────────────────────────────────────────

export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs: number;
  truncated: boolean;          // true if results were limited
  fingerprint?: string;        // hash for dedup / caching
}

// ── Narrative types ───────────────────────────────────────────────

export interface NarrativeSection {
  // THE OPPS ERA LENS section types
  type: 'answer' | 'options' | 'recommendation' | 'quick_wins' | 'roi_snapshot'
    | 'what_to_track' | 'conversation_driver' | 'assumptions' | 'data_sources'
    // General-purpose types
    | 'takeaway' | 'action' | 'risk'
    // Legacy types kept for backward compat
    | 'summary' | 'detail' | 'insight' | 'caveat' | 'suggestion'
    // Proactive intelligence types
    | 'follow_up' | 'chart_hint';
  content: string;
}

export interface NarrativeResponse {
  text: string;                // full markdown response
  sections: NarrativeSection[];
  tokensInput: number;
  tokensOutput: number;
  latencyMs: number;
}

// ── Pipeline types ────────────────────────────────────────────────

export interface PipelineInput {
  message: string;
  context: IntentContext;
  examples?: EvalExample[];
  skipNarrative?: boolean;     // return raw data without narrative (for API mode)
}

export interface ChartConfig {
  type: 'line' | 'bar' | 'sparkline' | 'table' | 'metric_card' | 'comparison';
  // Data columns to use
  xAxis?: string;   // column name for x-axis (usually date or category)
  yAxis?: string[];  // column names for y-axis (metric values)
  // Labels
  title?: string;
  xLabel?: string;
  yLabel?: string;
  // Formatting
  yFormat?: 'currency' | 'number' | 'percent';
  // Comparison
  comparisonLabel?: string;
}

export interface PipelineOutput {
  mode: PipelineMode;
  narrative: string | null;
  sections: NarrativeSection[];
  data: QueryResult | null;
  plan: QueryPlan | null;
  isClarification: boolean;
  clarificationText: string | null;
  // Eval turn ID — ULID of the captured turn, null if capture failed or was skipped
  evalTurnId: string | null;
  // Metadata for eval capture
  llmConfidence: number | null;
  llmLatencyMs: number;
  executionTimeMs: number | null;
  tokensInput: number;
  tokensOutput: number;
  provider: string;
  model: string;
  compiledSql: string | null;
  compilationErrors: string[];
  tablesAccessed: string[];
  cacheStatus: 'HIT' | 'MISS' | 'SKIP' | 'STALE';
  // Mode B only: the generated SQL explanation
  sqlExplanation?: string;
  // Proactive intelligence
  suggestedFollowUps?: string[];
  chartConfig?: ChartConfig | null;
  // Data quality assessment
  dataQuality?: {
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    score: number;
    factors: Array<{ name: string; score: number; weight: number; detail: string }>;
    summary: string;
  } | null;
}

// ── Errors ────────────────────────────────────────────────────────

export class LLMError extends Error {
  constructor(
    message: string,
    public code: 'PROVIDER_ERROR' | 'PARSE_ERROR' | 'RATE_LIMIT' | 'CONTEXT_OVERFLOW',
    public retryable: boolean = false,
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

export class ExecutionError extends Error {
  constructor(
    message: string,
    public code: 'QUERY_TIMEOUT' | 'QUERY_ERROR' | 'RESULT_TOO_LARGE',
  ) {
    super(message);
    this.name = 'ExecutionError';
  }
}
