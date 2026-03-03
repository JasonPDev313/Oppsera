import type { ResolvedIntent } from './types';

// ── Complexity-Based Model Routing (3-Tier) ─────────────────────
// Dynamically selects the optimal model tier for narrative generation
// based on message complexity, intent classification, and safety nets.
//
// Intent resolution & SQL generation always use Haiku (structured JSON).
// This router determines the narrative model only.

// ── Model tier type ─────────────────────────────────────────────

export type ModelTier = 'haiku' | 'sonnet' | 'opus';

export interface ModelRouting {
  /** Selected model tier */
  tier: ModelTier;
  /** Actual model ID to use */
  model: string;
  /** Human-readable explanation of why this tier was chosen */
  reason: string;
}

// ── Model IDs ───────────────────────────────────────────────────

export const MODELS: Record<ModelTier, string> = {
  haiku: process.env.ANTHROPIC_FAST_MODEL ?? 'claude-haiku-4-5-20251001',
  sonnet: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5-20250929',
  opus: process.env.ANTHROPIC_POWER_MODEL ?? 'claude-opus-4-20250514',
};

// ── Complexity signals ──────────────────────────────────────────

/** Keywords that indicate analytical / multi-step reasoning */
const ANALYTICAL_KEYWORDS = /\b(compare|vs\.?|versus|correlat|analyz|analysis|forecast|predict|trend|why\s+(?:did|is|are|was|were)|root\s+cause|deep\s+(?:dive|analysis)|explain\s+why|what.?if|simulat|scenario|strateg|roadmap|plan|breakdown|decompos)\b/i;

/** Keywords that indicate simple informational queries */
const SIMPLE_KEYWORDS = /^(?:hi|hello|hey|thanks|thank\s+you|ok|okay|sure|yes|no|got\s+it)\b/i;

/** Detect document paste — long structured content (tables, CSVs, JSON, lists) */
const DOCUMENT_PASTE_PATTERN = /(?:\|.*\|.*\||\{[\s\S]*\}|"[^"]+",|^\d+[.)]\s)/m;

/** Multi-table SQL intent — cross-collection analysis */
const MULTI_TABLE_INDICATORS = /\b(join|cross.?reference|across\s+(?:all|multiple|different)|correlat|between\s+\w+\s+and\s+\w+)\b/i;

// ── Input for model selection ───────────────────────────────────

export interface SelectModelInput {
  /** The user's original message */
  message: string;
  /** Resolved intent (null if intent resolution failed) */
  intent: ResolvedIntent | null;
  /** Number of prior turns in conversation history */
  historyLength: number;
  /** Whether the fast path (deterministic regex) was used */
  isFastPath: boolean;
}

// ── selectModel ─────────────────────────────────────────────────

export function selectModel(input: SelectModelInput): ModelRouting {
  const { message, intent, historyLength, isFastPath } = input;
  const msgLen = message.trim().length;

  // ── Tier 0: Fast path always gets Haiku ────────────────────
  if (isFastPath) {
    return { tier: 'haiku', model: MODELS.haiku, reason: 'fast-path deterministic match' };
  }

  // ── Safety net: Intent resolution failed ───────────────────
  // No intent means the classifier errored. Use message length as fallback.
  if (!intent) {
    if (msgLen > 600) {
      return { tier: 'sonnet', model: MODELS.sonnet, reason: 'intent-failed + long message (>600 chars)' };
    }
    return { tier: 'haiku', model: MODELS.haiku, reason: 'intent-failed + short message' };
  }

  // ── Safety net: Document paste → always Opus ───────────────
  if (msgLen > 1000 && DOCUMENT_PASTE_PATTERN.test(message)) {
    return { tier: 'opus', model: MODELS.opus, reason: 'document paste detected (>1000 chars + structured content)' };
  }

  // ── Greetings / trivial messages → Haiku ───────────────────
  if (SIMPLE_KEYWORDS.test(message) && msgLen < 50) {
    return { tier: 'haiku', model: MODELS.haiku, reason: 'greeting or trivial message' };
  }

  // ── Clarification responses → Haiku ────────────────────────
  if (intent.isClarification) {
    return { tier: 'haiku', model: MODELS.haiku, reason: 'clarification response' };
  }

  // ── Score complexity ───────────────────────────────────────
  let complexityScore = 0;

  // Message length
  if (msgLen > 600) complexityScore += 2;
  else if (msgLen > 200) complexityScore += 1;

  // Analytical keywords
  if (ANALYTICAL_KEYWORDS.test(message)) complexityScore += 2;

  // Multi-table / cross-collection indicators
  if (MULTI_TABLE_INDICATORS.test(message)) complexityScore += 2;

  // SQL mode (generally more complex than metrics mode)
  if (intent.mode === 'sql') complexityScore += 1;

  // Plan complexity: multiple metrics or dimensions
  const planMetrics = intent.plan.metrics.length;
  const planDimensions = intent.plan.dimensions.length;
  const planFilters = intent.plan.filters.length;
  if (planMetrics + planDimensions > 4) complexityScore += 1;
  if (planFilters > 2) complexityScore += 1;

  // Multi-turn context (deeper conversations need more reasoning)
  if (historyLength > 5) complexityScore += 2;
  else if (historyLength > 2) complexityScore += 1;

  // Low confidence → bump up (safety net)
  if (intent.confidence < 0.5) complexityScore += 2;
  else if (intent.confidence < 0.7) complexityScore += 1;

  // ── Map score to tier ──────────────────────────────────────
  // 0-2 → Haiku, 3-5 → Sonnet, 6+ → Opus

  if (complexityScore >= 6) {
    return {
      tier: 'opus',
      model: MODELS.opus,
      reason: `high complexity (score=${complexityScore}): ${buildReasonDetail(input)}`,
    };
  }

  if (complexityScore >= 3) {
    return {
      tier: 'sonnet',
      model: MODELS.sonnet,
      reason: `medium complexity (score=${complexityScore}): ${buildReasonDetail(input)}`,
    };
  }

  return {
    tier: 'haiku',
    model: MODELS.haiku,
    reason: `low complexity (score=${complexityScore}): simple query, high confidence`,
  };
}

// ── Reason detail builder ───────────────────────────────────────

function buildReasonDetail(input: SelectModelInput): string {
  const parts: string[] = [];
  const { message, intent, historyLength } = input;

  if (message.length > 600) parts.push('long message');
  if (ANALYTICAL_KEYWORDS.test(message)) parts.push('analytical keywords');
  if (MULTI_TABLE_INDICATORS.test(message)) parts.push('multi-table');
  if (intent?.mode === 'sql') parts.push('sql-mode');
  if (intent && intent.confidence < 0.7) parts.push(`low confidence (${intent.confidence.toFixed(2)})`);
  if (historyLength > 2) parts.push(`${historyLength}-turn conversation`);

  const planItems = (intent?.plan.metrics.length ?? 0) + (intent?.plan.dimensions.length ?? 0);
  if (planItems > 4) parts.push(`${planItems} plan items`);

  return parts.join(', ') || 'multiple factors';
}

// ── Time-budget override ────────────────────────────────────────
// When pipeline time budget is tight, downgrade to Haiku regardless
// of what the router recommended. Call this AFTER selectModel().

export function applyTimeBudgetOverride(
  routing: ModelRouting,
  isTimeBudgetTight: boolean,
): ModelRouting {
  if (!isTimeBudgetTight) return routing;
  if (routing.tier === 'haiku') return routing;

  return {
    tier: 'haiku',
    model: MODELS.haiku,
    reason: `${routing.reason} [downgraded: time budget tight]`,
  };
}
