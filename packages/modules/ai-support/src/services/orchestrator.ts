import type { AiAssistantContext, SourceTier, ConfidenceLevel, StreamChunk } from '../types';
import {
  CONFIDENCE_THRESHOLDS, MODEL_TIERS, LONG_THREAD_THRESHOLD,
  TIER_ESCALATION_ORDER, LARGE_CONTEXT_CHAR_THRESHOLD,
  FEEDBACK_DOWNVOTE_RATE_THRESHOLD, FEEDBACK_MIN_SAMPLE_SIZE,
  FEEDBACK_LOOKBACK_LIMIT,
} from '../constants';
import type { ModelTier } from '../constants';
import { retrieveEvidence } from './retrieval';
import type { RetrievalResult } from './retrieval';
import { sanitizeResponse } from './content-guard';
import { db, aiAssistantFeedback, aiAssistantMessages, aiAssistantThreads } from '@oppsera/db';
import { eq, and, desc } from 'drizzle-orm';

// ── Types ───────────────────────────────────────────────────────────

export interface OrchestratorInput {
  messageText: string;
  context: AiAssistantContext;
  threadHistory: Array<{ role: string; content: string }>;
  mode: 'customer' | 'staff';
  /** User sentiment from the latest message — used to adapt tone. */
  userSentiment?: 'positive' | 'neutral' | 'frustrated' | 'angry' | null;
  /** Confidence from the most recent assistant response in this thread — used
   *  to avoid over-escalating simple follow-up questions when retrieval misses. */
  priorConfidence?: ConfidenceLevel | null;
}

// ── Prompt Builder ──────────────────────────────────────────────────

/** Strip newlines and control chars, cap length — prevents prompt injection via context fields. */
function sanitizeContextField(value: unknown, maxLen = 200): string {
  if (value == null) return '';
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\n\r\x00-\x1f]/g, ' ').slice(0, maxLen);
}

function buildSystemPrompt(
  context: AiAssistantContext,
  evidence: RetrievalResult[],
  mode: 'customer' | 'staff',
  userSentiment?: 'positive' | 'neutral' | 'frustrated' | 'angry' | null,
): string {
  const roleLabel = mode === 'staff' ? 'staff member' : 'customer';
  const toneGuide =
    mode === 'staff'
      ? 'Use professional but friendly language. You can reference technical terms and internal processes.'
      : 'Use simple, clear language. Avoid jargon and internal terms.';

  const evidenceBlock =
    evidence.length > 0
      ? evidence
          .map(
            (e, i) =>
              `<evidence index="${i + 1}" tier="${e.tier}" source="${e.source}"${e.matchScore != null ? ` match="${e.matchScore.toFixed(2)}"` : ''}>\n${e.content}\n</evidence>`,
          )
          .join('\n\n')
      : '<no-evidence>No pre-approved answers or documentation found for this question.</no-evidence>';

  // Customer-mode content guard: instruct the model to self-censor during generation
  // so sensitive data doesn't stream to the client before post-hoc sanitization.
  const contentGuard =
    mode === 'customer'
      ? `
## Content Restrictions (Customer Mode)
You MUST NOT include any of the following in your response:
- API paths or endpoints (e.g., /api/v1/...)
- Internal package names (e.g., @oppsera/module-*, @oppsera/core)
- Database table names (e.g., fnb_kitchen_tickets, catalog_products)
- Connection strings, environment variable references, or localhost URLs
- Code snippets, import statements, function signatures, or stack traces
- Internal architecture details (e.g., Drizzle ORM, Supabase, Vercel)
If the user asks a technical question, explain in terms of the UI and features, not the underlying implementation.`
      : '';

  // Suggested followups instruction
  const followupInstruction = `
## Suggested Follow-Up Questions
At the very end of your response, if appropriate, suggest 1-3 short follow-up questions the user might ask next.
Rules:
- Place them AFTER a "---" separator on its own line
- Use bullet points (- ) for each question
- Keep each question under 100 characters
- These should be natural continuations of the topic — things the user would logically ask next
- Do NOT put any other text after the "---" separator — only the bullet-point questions
- If the question is fully self-contained with no logical followups, omit this section entirely
- Do NOT use "---" anywhere else in your response as a horizontal rule — use blank lines to separate sections instead

Example:
---
- How do I [related action]?
- What happens if [edge case]?`;

  return `You are OppsEra Assistant, an AI support agent for OppsEra, a multi-tenant SaaS ERP platform for SMBs (retail, restaurant, golf, hybrid).

## Your Role
You help ${roleLabel}s understand how to use the software, diagnose issues, and provide step-by-step guidance.

## User Context
- Current page: ${sanitizeContextField(context.route)}
- Screen title: ${sanitizeContextField(context.screenTitle)}
- Module: ${sanitizeContextField(context.moduleKey)}
- User roles: ${sanitizeContextField(context.roleKeys.join(', '))}
${context.enabledModules ? `- Enabled modules: ${sanitizeContextField(context.enabledModules.join(', '))}` : ''}
${context.visibleActions ? `- Visible actions on screen: ${sanitizeContextField(context.visibleActions.join(', '))}` : ''}

## Evidence from Knowledge Base
${evidenceBlock}

## Response Rules
1. ${toneGuide}
2. If evidence is available, base your answer on it. Prioritize higher-tier evidence (t1/t2 over t5/t6). Cite sources when possible.
3. If you are unsure or evidence is insufficient, say so honestly. Never fabricate features or steps that don't exist.
4. For how-to questions, provide numbered step-by-step instructions when possible.
5. For diagnostic questions, provide a checklist of things to check, ordered by likelihood.
6. Keep answers concise but complete. Aim for clarity over brevity.
7. Respond in plain markdown. Do NOT wrap your response in JSON or code blocks.
8. If you cannot answer confidently, end your response with: "I'd recommend reaching out to your system administrator for further help."
9. When referencing navigation paths, use bold arrows: **Menu** → **Submenu** → **Action**.
10. When the user's question matches evidence from an answer card (t2), follow that answer closely — it has been human-reviewed and approved.
11. If the user seems frustrated or unable to resolve their issue, proactively suggest: "Would you like me to connect you with a team member who can help directly?" This gives them an escalation path.
${contentGuard}
${userSentiment === 'frustrated' || userSentiment === 'angry' ? `
## Tone Adaptation (User Sentiment: ${userSentiment})
The user appears ${userSentiment}. Please:
- Acknowledge their frustration empathetically before providing your answer
- Use a warmer, more patient tone
- Be extra clear and specific in your instructions
- If you cannot resolve their issue, proactively offer to connect them with a human team member` : ''}
${followupInstruction}`;
}

// ── Confidence Scorer ────────────────────────────────────────────────

/**
 * Computes confidence level from evidence quality.
 *
 * Factors in both the evidence tier AND the match quality score
 * when available. A high-tier match with a poor match score should
 * not blindly produce high confidence.
 */
function scoreConfidence(evidence: RetrievalResult[]): ConfidenceLevel {
  if (evidence.length === 0) return 'low';

  const tierBaseScore: Record<string, number> = {
    t1: 1.0,
    t2: 0.9,
    t3: 0.85,
    t4: 0.7,
    t5: 0.5,
    t6: 0.4,
    t7: 0.3,
  };

  // For each evidence item, compute an effective score that factors in match quality.
  // matchScore (0–1) modulates the tier base score:
  //   effectiveScore = tierBase * (0.5 + 0.5 * matchScore)
  // This means:
  //   matchScore = 1.0 → 100% of tier score
  //   matchScore = 0.5 → 75% of tier score
  //   matchScore = 0.25 → 62.5% of tier score
  //   no matchScore → 100% (manifests, memory)
  const bestScore = Math.max(
    ...evidence.map((e) => {
      const base = tierBaseScore[e.tier] ?? 0;
      if (e.matchScore != null) {
        return base * (0.5 + 0.5 * e.matchScore);
      }
      return base;
    }),
  );

  if (bestScore >= CONFIDENCE_THRESHOLDS.HIGH) return 'high';
  if (bestScore >= CONFIDENCE_THRESHOLDS.MEDIUM) return 'medium';
  return 'low';
}

function highestTier(evidence: RetrievalResult[]): SourceTier {
  const tierOrder: SourceTier[] = ['t1', 't2', 't3', 't4', 't5', 't6', 't7'];
  for (const tier of tierOrder) {
    if (evidence.some((e) => e.tier === tier)) return tier;
  }
  return 't7';
}

// ── Model Selector (Waterfall) ──────────────────────────────────────

/** Bump a tier up by one step (fast→standard→deep). Already at deep = no-op. */
function bumpTier(tier: ModelTier): ModelTier {
  const idx = TIER_ESCALATION_ORDER.indexOf(tier);
  return TIER_ESCALATION_ORDER[Math.min(idx + 1, TIER_ESCALATION_ORDER.length - 1)]!;
}

/** Get the next escalation tier (for retry-on-failure). Returns null if already at max. */
function nextTier(tier: ModelTier): ModelTier | null {
  const idx = TIER_ESCALATION_ORDER.indexOf(tier);
  return idx < TIER_ESCALATION_ORDER.length - 1
    ? TIER_ESCALATION_ORDER[idx + 1]!
    : null;
}

interface ModelSelectionResult {
  tier: ModelTier;
  reasons: string[];
}

/**
 * Selects the cheapest model that can answer the question well.
 *
 * Routing rules:
 *   1. High confidence (strong T2/T3 curated match) → Haiku (answer is ~known, just format it)
 *   2. Medium confidence (T4-T5 evidence)           → Sonnet (needs reasoning over docs)
 *   3. Low confidence (T6-T7 or nothing)            → Opus  (must reason deeply or gracefully decline)
 *
 * Escalation bumps (applied in order):
 *   - Best evidence from T6+ only       → minimum Sonnet (semantic-only results need more reasoning)
 *   - Large input context (>8k chars)    → minimum Sonnet (Haiku struggles with large context)
 *   - Long thread history (>6 messages)  → bump up one tier (conversation is getting complex)
 *   - Customer mode                      → minimum Sonnet (external-facing answers need higher quality)
 *   - Feedback-aware (async)             → bump if route+module has high thumbs-down rate on cheaper model
 */
function selectModel(
  confidence: ConfidenceLevel,
  bestTier: SourceTier,
  threadHistoryLength: number,
  inputCharCount: number,
  mode: 'customer' | 'staff',
  priorConfidence?: ConfidenceLevel | null,
): ModelSelectionResult {
  const reasons: string[] = [];

  // Follow-up confidence floor: if this is a follow-up (history > 0) and current
  // retrieval found nothing (low), but the prior turn had good evidence, carry
  // that forward — the conversation context is still relevant.
  let effectiveConfidence = confidence;
  if (threadHistoryLength > 0 && confidence === 'low') {
    if (priorConfidence === 'high' || priorConfidence === 'medium') {
      // Prior turn had evidence — floor at medium (Sonnet), not deep (Opus)
      effectiveConfidence = 'medium';
      reasons.push(`followup-floor→medium (prior=${priorConfidence})`);
    } else {
      // No prior confidence info — still floor at medium for follow-ups
      // since the user is continuing a conversation, not asking from scratch
      effectiveConfidence = 'medium';
      reasons.push('followup-floor→medium (continuation)');
    }
  }

  // Base tier from confidence
  let tier: ModelTier =
    effectiveConfidence === 'high' ? 'fast' :
    effectiveConfidence === 'medium' ? 'standard' :
    'deep';
  reasons.push(`base=${tier} (confidence=${confidence}, effective=${effectiveConfidence})`);

  // Bump: if best evidence is only from low tiers (T6+), minimum Sonnet
  if (tier === 'fast' && (bestTier === 't6' || bestTier === 't7')) {
    tier = 'standard';
    reasons.push(`bump→standard (bestTier=${bestTier})`);
  }

  // Bump: large input context — Haiku has smaller effective context and may truncate/struggle
  if (tier === 'fast' && inputCharCount > LARGE_CONTEXT_CHAR_THRESHOLD) {
    tier = 'standard';
    reasons.push(`bump→standard (inputChars=${inputCharCount})`);
  }

  // Bump: long conversations indicate complexity
  if (threadHistoryLength >= LONG_THREAD_THRESHOLD) {
    const before = tier;
    tier = bumpTier(tier);
    if (tier !== before) {
      reasons.push(`bump→${tier} (historyLen=${threadHistoryLength})`);
    }
  }

  // Bump: customer mode floor — external-facing answers need minimum Sonnet quality
  if (mode === 'customer' && tier === 'fast') {
    tier = 'standard';
    reasons.push('bump→standard (customer-mode-floor)');
  }

  return { tier, reasons };
}

/**
 * Check if recent feedback for this route+module suggests the cheap model
 * is producing poor answers. If so, recommend bumping up.
 *
 * Runs as a non-blocking query — if it fails or is slow, returns null (no bump).
 * Uses a simple heuristic: if >= 40% of recent answers from a given model on this
 * route+module got thumbs-down, bump the tier.
 */
async function checkFeedbackBump(
  route: string | undefined,
  moduleKey: string | undefined,
  currentTier: ModelTier,
): Promise<{ shouldBump: boolean; downvoteRate: number } | null> {
  // Only applies to fast tier (no point bumping deep)
  if (currentTier !== 'fast') return null;
  if (!route && !moduleKey) return null;

  try {
    const currentModelId = MODEL_TIERS[currentTier].id;

    // Query: join feedback → messages → threads to get thumbs-down rate
    // for the current model on this route+module combination
    const conditions = [
      eq(aiAssistantMessages.modelName, currentModelId),
      eq(aiAssistantMessages.role, 'assistant'),
    ];
    if (route) {
      conditions.push(eq(aiAssistantThreads.currentRoute, route));
    }
    if (moduleKey) {
      conditions.push(eq(aiAssistantThreads.moduleKey, moduleKey));
    }

    const rows = await db
      .select({
        rating: aiAssistantFeedback.rating,
      })
      .from(aiAssistantFeedback)
      .innerJoin(
        aiAssistantMessages,
        eq(aiAssistantFeedback.messageId, aiAssistantMessages.id),
      )
      .innerJoin(
        aiAssistantThreads,
        eq(aiAssistantMessages.threadId, aiAssistantThreads.id),
      )
      .where(and(...conditions))
      .orderBy(desc(aiAssistantFeedback.createdAt))
      .limit(FEEDBACK_LOOKBACK_LIMIT);

    if (rows.length < FEEDBACK_MIN_SAMPLE_SIZE) return null;

    const downCount = rows.filter((r) => r.rating === 'down').length;
    const downvoteRate = downCount / rows.length;

    return {
      shouldBump: downvoteRate >= FEEDBACK_DOWNVOTE_RATE_THRESHOLD,
      downvoteRate,
    };
  } catch (err) {
    // Non-critical — degrade gracefully
    console.warn('[ai-support/orchestrator] Feedback check failed:', err);
    return null;
  }
}

// ── Followup Extractor ──────────────────────────────────────────────

/** Maximum length for a single followup question — prevents runaway model output. */
const MAX_FOLLOWUP_LENGTH = 200;

/**
 * Extracts suggested followup questions from the model's response.
 * The model is instructed to put them after a "---" separator as a bullet list.
 * Returns the extracted followups (empty array if none found).
 *
 * Hardened against:
 *  - `---` inside fenced code blocks (stripped before scanning)
 *  - Legitimate markdown HRs mid-content (validates ALL lines are bullets)
 *  - Very long model output in bullets (capped at MAX_FOLLOWUP_LENGTH)
 *  - Numbered list format (1. / 2.) as fallback if model deviates from bullets
 */
function extractFollowups(text: string): string[] {
  // Strip fenced code blocks so we don't match "---" inside them
  const stripped = text.replace(/```[\s\S]*?```/g, '');

  // Find the last "---" separator outside code blocks
  const lastSeparator = stripped.lastIndexOf('\n---');
  if (lastSeparator === -1) return [];

  const afterSeparator = stripped.slice(lastSeparator + 4);
  const lines = afterSeparator.split('\n').map((l) => l.trim());

  // Validate: every non-empty line after the separator must look like a
  // followup bullet (- / * / numbered). If any line doesn't match, this
  // is a legitimate markdown HR, not a followup section.
  const nonEmpty = lines.filter((l) => l.length > 0);
  if (nonEmpty.length === 0) return [];
  const allFollowupLines = nonEmpty.every((l) => /^[-*]\s+/.test(l) || /^\d+[.)]\s+/.test(l));
  if (!allFollowupLines) return [];

  const followups: string[] = [];
  for (const line of nonEmpty) {
    // Match bullet points: "- How do I..." or "* How do I..."
    // Also accept numbered: "1. How do I..." or "1) How do I..."
    const match = line.match(/^(?:[-*]|\d+[.)])\s+(.+)/);
    if (match?.[1] && match[1].length > 10) {
      followups.push(match[1].slice(0, MAX_FOLLOWUP_LENGTH));
    }
  }

  return followups.slice(0, 3);
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Rough token estimate: ~4 chars per token for English text. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Prepare conversation messages: cap to last 10 messages with a token-aware budget.
 *
 * Uses a 12k token budget for history (leaves room for system prompt + response).
 * Falls back to the 20k char hard cap as a safety net.
 * Returns the formatted messages array and total input char count (for context-size guard).
 */
const HISTORY_TOKEN_BUDGET = 12_000;
const HISTORY_CHAR_LIMIT = 20_000;

function prepareMessages(
  threadHistory: Array<{ role: string; content: string }>,
  messageText: string,
): { messages: Array<{ role: string; content: string }>; inputCharCount: number } {
  let trimmedHistory = threadHistory.slice(-10);

  // Token-aware trimming: drop oldest messages until within budget
  let totalTokens = trimmedHistory.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  while (totalTokens > HISTORY_TOKEN_BUDGET && trimmedHistory.length > 0) {
    totalTokens -= estimateTokens(trimmedHistory[0]!.content);
    trimmedHistory = trimmedHistory.slice(1);
  }

  // Char-based safety net (in case token estimate is off)
  let totalChars = trimmedHistory.reduce((sum, m) => sum + m.content.length, 0);
  while (totalChars > HISTORY_CHAR_LIMIT && trimmedHistory.length > 0) {
    totalChars -= trimmedHistory[0]!.content.length;
    trimmedHistory = trimmedHistory.slice(1);
  }

  const messages = [
    ...trimmedHistory.map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content,
    })),
    { role: 'user', content: messageText },
  ];

  const inputCharCount = messages.reduce((sum, m) => sum + m.content.length, 0);
  return { messages, inputCharCount };
}

/** Check if an error is retryable (API failures, timeouts — NOT auth or validation errors). */
function isRetryableError(err: unknown): boolean {
  if (err instanceof ModelApiError) return err.isRetryable;
  // AbortError = timeout
  if (err instanceof Error && err.name === 'AbortError') return true;
  // Network errors
  if (err instanceof TypeError && err.message.includes('fetch')) return true;
  return false;
}

/** Structured JSON log for model selection decisions — enables analytics and debugging. */
function logModelSelection(
  input: OrchestratorInput,
  selection: ModelSelectionResult,
  modelId: string,
): void {
  console.info(JSON.stringify({
    level: 'info',
    event: 'ai_model_selected',
    model: modelId,
    tier: selection.tier,
    reasons: selection.reasons,
    route: input.context.route?.slice(0, 100),
    moduleKey: input.context.moduleKey ?? null,
    mode: input.mode,
    historyLen: input.threadHistory.length,
    questionLen: input.messageText.length,
    priorConfidence: input.priorConfidence ?? null,
  }));
}

// ── Claude API Call ──────────────────────────────────────────────────

/**
 * Call the Anthropic Messages API using fetch with streaming.
 * The model responds in plain markdown (not JSON).
 * Each text delta is forwarded to the onChunk callback for real-time streaming.
 */
/** Total timeout — abort the entire streaming call after 55s (5s buffer before Vercel's 60s limit). */
const STREAM_TOTAL_TIMEOUT_MS = 55_000;
/** Idle timeout — abort if no data received for 30s (covers Anthropic stalls). */
const STREAM_IDLE_TIMEOUT_MS = 30_000;
/** Reduced timeout for retry attempts — leave room for the escalation call. */
const STREAM_RETRY_TIMEOUT_MS = 25_000;

/** Error class for API failures that should trigger model escalation. */
class ModelApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly isRetryable: boolean,
  ) {
    super(message);
    this.name = 'ModelApiError';
  }
}

async function callClaudeStreaming(
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  onChunk: (text: string) => void,
  modelId: string = MODEL_TIERS.standard.id,
  maxTokens: number = MODEL_TIERS.standard.maxTokens,
  totalTimeoutMs: number = STREAM_TOTAL_TIMEOUT_MS,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }

  const abortController = new AbortController();
  const totalTimeout = setTimeout(() => abortController.abort(), totalTimeoutMs);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: messages.map((m) => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content,
        })),
        stream: true,
      }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      // 429 (rate limit), 529 (overloaded), 500+ are retryable via escalation
      const isRetryable = response.status === 429 || response.status >= 500;
      throw new ModelApiError(
        `Anthropic API error ${response.status}: ${errorBody}`,
        response.status,
        isRetryable,
      );
    }

    if (!response.body) {
      throw new Error('Anthropic API returned no body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    // Idle timeout — resets on each chunk received
    let idleTimer = setTimeout(() => abortController.abort(), STREAM_IDLE_TIMEOUT_MS);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Reset idle timer on each chunk
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => abortController.abort(), STREAM_IDLE_TIMEOUT_MS);

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const event = JSON.parse(data);
          if (event.type === 'content_block_delta' && event.delta?.text) {
            fullText += event.delta.text;
            onChunk(event.delta.text);
          }
        } catch {
          // Skip unparseable lines
        }
      }
    }

    clearTimeout(idleTimer);
    return fullText;
  } finally {
    clearTimeout(totalTimeout);
  }
}

// ── Main Orchestrator ────────────────────────────────────────────────

/**
 * Runs the full AI assistant pipeline: two-stage retrieval (structured + semantic),
 * prompt building, Claude API call with streaming, and content guard sanitization.
 *
 * The model responds in plain markdown (not JSON), so the streamed text is
 * displayed directly in the chat bubble. Confidence and source metadata are
 * derived from evidence tiers, not from model output.
 *
 * Returns a ReadableStream that emits SSE-formatted StreamChunk events.
 */
export function runOrchestrator(input: OrchestratorInput): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let cancelled = false;
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controllerRef = controller;

      const sendEvent = (chunk: StreamChunk) => {
        if (cancelled || !controllerRef) return;
        const line = `data: ${JSON.stringify(chunk)}\n\n`;
        try {
          controllerRef.enqueue(encoder.encode(line));
        } catch {
          cancelled = true;
          controllerRef = null;
        }
      };

      try {
        // Start feedback-bump check early — runs in parallel with retrieval
        const feedbackBumpPromise = checkFeedbackBump(
          input.context.route,
          input.context.moduleKey,
          'fast',
        );

        // ── Step 1: Two-stage retrieval (structured + semantic) ──
        // Catch retrieval failures and degrade to no evidence rather than
        // aborting the entire stream — the AI can still answer without evidence.
        let allEvidence: RetrievalResult[];
        try {
          allEvidence = await retrieveEvidence({
            route: input.context.route,
            moduleKey: input.context.moduleKey,
            question: input.messageText,
            mode: input.mode,
            context: input.context,
          });
        } catch (retErr) {
          console.warn(JSON.stringify({
            level: 'warn',
            event: 'ai_retrieval_failed',
            error: retErr instanceof Error ? retErr.message : String(retErr),
            route: input.context.route?.slice(0, 100),
            moduleKey: input.context.moduleKey ?? null,
          }));
          allEvidence = [];
        }

        // ── Step 2: Compute confidence from evidence tiers + match quality ──
        const evidenceConfidence = scoreConfidence(allEvidence);
        const bestTier = highestTier(allEvidence);
        const sources = allEvidence.map((e) => e.source);

        // ── Step 3: Build system prompt ──
        const systemPrompt = buildSystemPrompt(
          input.context,
          allEvidence,
          input.mode,
          input.userSentiment,
        );

        // ── Step 4: Prepare conversation messages ──
        const { messages, inputCharCount } = prepareMessages(
          input.threadHistory,
          input.messageText,
        );

        // ── Step 5: Select model tier (with all hardening signals) ──
        const selection = selectModel(
          evidenceConfidence,
          bestTier,
          input.threadHistory.length,
          inputCharCount + systemPrompt.length,
          input.mode,
          input.priorConfidence,
        );

        // Await the feedback-bump result (started in parallel with retrieval)
        if (selection.tier === 'fast') {
          const feedbackBump = await feedbackBumpPromise;
          if (feedbackBump?.shouldBump) {
            selection.tier = bumpTier(selection.tier);
            selection.reasons.push(
              `bump→${selection.tier} (feedback downvoteRate=${feedbackBump.downvoteRate.toFixed(2)})`,
            );
          }
        }

        const modelConfig = MODEL_TIERS[selection.tier];

        // Structured log: model selection decision
        logModelSelection(input, selection, modelConfig.id);

        // ── Step 6: Call Claude with streaming + auto-retry on failure ──
        let fullText: string;
        let finalModelId = modelConfig.id;
        try {
          fullText = await callClaudeStreaming(
            systemPrompt,
            messages,
            (text) => sendEvent({ type: 'chunk', text }),
            modelConfig.id,
            modelConfig.maxTokens,
          );
        } catch (err) {
          // Auto-escalate on ANY API error — not just retryable ones.
          // A non-retryable error (e.g. 404 from a deprecated model ID) on the
          // cheap tier should still attempt the next tier before giving up.
          const escalationTier = nextTier(selection.tier);
          if (escalationTier) {
            const escalatedConfig = MODEL_TIERS[escalationTier];
            console.warn(JSON.stringify({
              level: 'warn',
              event: 'ai_model_escalation',
              from: modelConfig.id,
              to: escalatedConfig.id,
              reason: err instanceof Error ? err.message : 'unknown',
              retryable: isRetryableError(err),
            }));
            finalModelId = escalatedConfig.id;
            fullText = await callClaudeStreaming(
              systemPrompt,
              messages,
              (text) => sendEvent({ type: 'chunk', text }),
              escalatedConfig.id,
              escalatedConfig.maxTokens,
              STREAM_RETRY_TIMEOUT_MS,
            );
          } else {
            throw err;
          }
        }

        // ── Step 7: Sanitize (post-hoc safety net for customer mode) ──
        const sanitized = sanitizeResponse(fullText, input.mode);
        if (sanitized !== fullText) {
          sendEvent({ type: 'chunk', text: '\n\n---\n*[Response modified for safety]*' });
        }

        // ── Step 8: Extract followups and send done event ──
        const suggestedFollowups = extractFollowups(fullText);

        sendEvent({
          type: 'done',
          confidence: evidenceConfidence,
          sourceTier: bestTier,
          sources,
          suggestedFollowups: suggestedFollowups.length > 0 ? suggestedFollowups : undefined,
          modelUsed: finalModelId,
        });
      } catch (err) {
        if (cancelled) return;
        console.error(JSON.stringify({
          level: 'error',
          event: 'ai_orchestrator_stream_error',
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined,
          route: input.context.route?.slice(0, 100),
          moduleKey: input.context.moduleKey ?? null,
          mode: input.mode,
        }));
        const hint = err instanceof Error ? err.message.slice(0, 120) : '';
        sendEvent({
          type: 'error',
          message: `Something went wrong. Please try again.${hint ? ` (${hint})` : ''}`,
        });
      } finally {
        try {
          controllerRef?.close();
        } catch {
          // Already closed
        }
        controllerRef = null;
      }
    },
    cancel() {
      cancelled = true;
      controllerRef = null;
    },
  });

  return stream;
}

/**
 * Variant used by thread commands: runs the orchestrator and returns
 * the SSE stream plus pre-computed metadata for the DB record.
 *
 * The actual answer text is captured from the stream by the API route's
 * wrapStreamWithPersistence() and written to the DB after streaming completes.
 */
export async function runOrchestratorCollected(
  input: OrchestratorInput,
): Promise<{
  answer: string;
  confidence: ConfidenceLevel;
  sourceTierUsed: SourceTier;
  sources: string[];
  needsReview: boolean;
  modelUsed: string;
  stream: ReadableStream<Uint8Array>;
}> {
  // Start feedback-bump check early — runs in parallel with evidence retrieval
  // so it doesn't add latency to the fast path (Haiku, high-confidence).
  const feedbackBumpPromise = checkFeedbackBump(
    input.context.route,
    input.context.moduleKey,
    'fast', // optimistically check for the cheapest tier
  );

  // Retrieve evidence (two-stage) — catch failures so the user still gets
  // an AI response even if retrieval is degraded (e.g. DB timeout, pgvector down).
  let allEvidence: RetrievalResult[];
  try {
    // For follow-up questions, enrich the retrieval query with prior context.
    // Short follow-ups like "How do I do that myself?" lack keywords for retrieval.
    // Prepending the last user+assistant exchange gives retrieval enough signal.
    let retrievalQuery = input.messageText;
    if (input.threadHistory.length >= 2) {
      const lastUserMsg = [...input.threadHistory].reverse().find((m) => m.role === 'user');
      const lastAssistantMsg = [...input.threadHistory].reverse().find((m) => m.role === 'assistant');
      if (lastUserMsg && lastAssistantMsg) {
        // Only enrich if current question is short (likely a follow-up, not a topic change)
        if (input.messageText.length < 120) {
          retrievalQuery = `${lastUserMsg.content.slice(0, 200)}\n${lastAssistantMsg.content.slice(0, 300)}\n${input.messageText}`;
        }
      }
    }

    allEvidence = await retrieveEvidence({
      route: input.context.route,
      moduleKey: input.context.moduleKey,
      question: retrievalQuery,
      mode: input.mode,
      context: input.context,
    });
  } catch (err) {
    console.warn(JSON.stringify({
      level: 'warn',
      event: 'ai_retrieval_failed',
      error: err instanceof Error ? err.message : String(err),
      route: input.context.route?.slice(0, 100),
      moduleKey: input.context.moduleKey ?? null,
    }));
    allEvidence = [];
  }

  const evidenceConfidence = scoreConfidence(allEvidence);
  const bestTier = highestTier(allEvidence);
  const sources = allEvidence.map((e) => e.source);

  const systemPrompt = buildSystemPrompt(input.context, allEvidence, input.mode, input.userSentiment);

  const { messages, inputCharCount } = prepareMessages(
    input.threadHistory,
    input.messageText,
  );

  // Select model tier (with all hardening signals)
  const selection = selectModel(
    evidenceConfidence,
    bestTier,
    input.threadHistory.length,
    inputCharCount + systemPrompt.length,
    input.mode,
    input.priorConfidence,
  );

  // Await the feedback-bump result (started in parallel with retrieval)
  // Only applies when selection landed on 'fast' tier
  if (selection.tier === 'fast') {
    const feedbackBump = await feedbackBumpPromise;
    if (feedbackBump?.shouldBump) {
      selection.tier = bumpTier(selection.tier);
      selection.reasons.push(
        `bump→${selection.tier} (feedback downvoteRate=${feedbackBump.downvoteRate.toFixed(2)})`,
      );
    }
  }

  const modelConfig = MODEL_TIERS[selection.tier];

  // Structured log: model selection decision
  logModelSelection(input, selection, modelConfig.id);

  // Track the final model used (may change if retry escalates)
  let finalModelId = modelConfig.id;

  const encoder = new TextEncoder();
  let cancelled = false;
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controllerRef = controller;

      const sendEvent = (chunk: StreamChunk) => {
        if (cancelled || !controllerRef) return;
        const line = `data: ${JSON.stringify(chunk)}\n\n`;
        try {
          controllerRef.enqueue(encoder.encode(line));
        } catch {
          cancelled = true;
          controllerRef = null;
        }
      };

      try {
        // Stream with auto-retry on failure
        let fullText: string;
        try {
          fullText = await callClaudeStreaming(
            systemPrompt,
            messages,
            (text) => sendEvent({ type: 'chunk', text }),
            modelConfig.id,
            modelConfig.maxTokens,
          );
        } catch (err) {
          // Auto-escalate on ANY API error — not just retryable ones.
          // A non-retryable error (e.g. 404 from a deprecated model ID) on the
          // cheap tier should still attempt the next tier before giving up.
          const escalationTier = nextTier(selection.tier);
          if (escalationTier) {
            const escalatedConfig = MODEL_TIERS[escalationTier];
            console.warn(JSON.stringify({
              level: 'warn',
              event: 'ai_model_escalation',
              from: modelConfig.id,
              to: escalatedConfig.id,
              reason: err instanceof Error ? err.message : 'unknown',
              retryable: isRetryableError(err),
            }));
            finalModelId = escalatedConfig.id;
            fullText = await callClaudeStreaming(
              systemPrompt,
              messages,
              (text) => sendEvent({ type: 'chunk', text }),
              escalatedConfig.id,
              escalatedConfig.maxTokens,
              STREAM_RETRY_TIMEOUT_MS,
            );
          } else {
            throw err;
          }
        }

        // Post-hoc safety net for customer mode
        const sanitized = sanitizeResponse(fullText, input.mode);
        if (sanitized !== fullText) {
          sendEvent({ type: 'chunk', text: '\n\n---\n*[Response modified for safety]*' });
        }

        const suggestedFollowups = extractFollowups(fullText);

        sendEvent({
          type: 'done',
          confidence: evidenceConfidence,
          sourceTier: bestTier,
          sources,
          suggestedFollowups: suggestedFollowups.length > 0 ? suggestedFollowups : undefined,
          modelUsed: finalModelId,
        });
      } catch (err) {
        if (cancelled) return;
        console.error(JSON.stringify({
          level: 'error',
          event: 'ai_orchestrator_stream_error',
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined,
          route: input.context.route?.slice(0, 100),
          moduleKey: input.context.moduleKey ?? null,
          mode: input.mode,
        }));
        const hint = err instanceof Error ? err.message.slice(0, 120) : '';
        sendEvent({
          type: 'error',
          message: `Something went wrong. Please try again.${hint ? ` (${hint})` : ''}`,
        });
      } finally {
        try {
          controllerRef?.close();
        } catch {
          // Already closed
        }
        controllerRef = null;
      }
    },
    cancel() {
      cancelled = true;
      controllerRef = null;
    },
  });

  return {
    answer: '', // Placeholder — actual text persisted by wrapStreamWithPersistence()
    confidence: evidenceConfidence,
    sourceTierUsed: bestTier,
    sources,
    needsReview: evidenceConfidence === 'low',
    modelUsed: finalModelId,
    stream,
  };
}
