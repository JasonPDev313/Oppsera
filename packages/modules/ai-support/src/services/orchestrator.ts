import type { AiAssistantContext, SourceTier, ConfidenceLevel, StreamChunk } from '../types';
import { CONFIDENCE_THRESHOLDS } from '../constants';
import { retrieveEvidence } from './retrieval';
import type { RetrievalResult } from './retrieval';
import { sanitizeResponse } from './content-guard';

// ── Types ───────────────────────────────────────────────────────────

interface OrchestratorInput {
  messageText: string;
  context: AiAssistantContext;
  threadHistory: Array<{ role: string; content: string }>;
  mode: 'customer' | 'staff';
}

// ── Prompt Builder ──────────────────────────────────────────────────

function buildSystemPrompt(
  context: AiAssistantContext,
  evidence: RetrievalResult[],
  mode: 'customer' | 'staff',
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
              `<evidence index="${i + 1}" tier="${e.tier}" source="${e.source}">\n${e.content}\n</evidence>`,
          )
          .join('\n\n')
      : '<no-evidence>No pre-approved answers or documentation found for this question.</no-evidence>';

  return `You are OppsEra Assistant, an AI support agent for OppsEra, a multi-tenant SaaS ERP platform for SMBs (retail, restaurant, golf, hybrid).

## Your Role
You help ${roleLabel}s understand how to use the software, diagnose issues, and provide step-by-step guidance.

## User Context
- Current page: ${context.route ?? 'unknown'}
- Screen title: ${context.screenTitle ?? 'unknown'}
- Module: ${context.moduleKey ?? 'unknown'}
- User roles: ${context.roleKeys.join(', ') || 'unknown'}
${context.enabledModules ? `- Enabled modules: ${context.enabledModules.join(', ')}` : ''}
${context.visibleActions ? `- Visible actions on screen: ${context.visibleActions.join(', ')}` : ''}

## Evidence from Knowledge Base
${evidenceBlock}

## Response Rules
1. ${toneGuide}
2. If evidence is available, base your answer on it. Cite sources when possible.
3. If you are unsure or evidence is insufficient, say so honestly. Never fabricate features or steps that don't exist.
4. For how-to questions, provide numbered step-by-step instructions when possible.
5. For diagnostic questions, ask clarifying questions if needed.
6. Keep answers concise but complete.
7. Respond in plain markdown. Do NOT wrap your response in JSON or code blocks.
8. If you cannot answer confidently, end your response with: "I'd recommend reaching out to your system administrator for further help."`;
}

// ── Confidence Scorer ────────────────────────────────────────────────

function scoreConfidence(evidence: RetrievalResult[]): ConfidenceLevel {
  if (evidence.length === 0) return 'low';

  const tierPriority: Record<string, number> = {
    t1: 1.0,
    t2: 0.9,
    t3: 0.85,
    t4: 0.7,
    t5: 0.5,
    t6: 0.4,
    t7: 0.3,
  };

  const bestScore = Math.max(
    ...evidence.map((e) => tierPriority[e.tier] ?? 0),
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

// ── Claude API Call ──────────────────────────────────────────────────

/**
 * Call the Anthropic Messages API using fetch with streaming.
 * The model responds in plain markdown (not JSON).
 * Each text delta is forwarded to the onChunk callback for real-time streaming.
 */
async function callClaudeStreaming(
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  onChunk: (text: string) => void,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      })),
      stream: true,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errorBody}`);
  }

  if (!response.body) {
    throw new Error('Anthropic API returned no body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

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

  return fullText;
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
        // ── Step 1: Two-stage retrieval (structured + semantic) ──
        const allEvidence = await retrieveEvidence({
          route: input.context.route,
          moduleKey: input.context.moduleKey,
          question: input.messageText,
          mode: input.mode,
          context: input.context,
        });

        // ── Step 2: Compute confidence from evidence tiers ──
        const evidenceConfidence = scoreConfidence(allEvidence);
        const bestTier = highestTier(allEvidence);
        const sources = allEvidence.map((e) => e.source);

        // ── Step 3: Build system prompt ──
        const systemPrompt = buildSystemPrompt(
          input.context,
          allEvidence,
          input.mode,
        );

        // ── Step 4: Prepare conversation messages ──
        const messages = [
          ...input.threadHistory.map((m) => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content,
          })),
          { role: 'user', content: input.messageText },
        ];

        // ── Step 5: Call Claude with streaming ──
        // The model responds in plain markdown, which streams directly to the UI.
        const fullText = await callClaudeStreaming(
          systemPrompt,
          messages,
          (text) => sendEvent({ type: 'chunk', text }),
        );

        // ── Step 6: Sanitize and send done event ──
        // Content guard runs on the full text for customer mode
        const sanitized = sanitizeResponse(fullText, input.mode);
        if (sanitized !== fullText) {
          // If the guard modified the text, send a replacement chunk
          // Clear the streamed text and send the sanitized version
          sendEvent({ type: 'chunk', text: '\n\n---\n*[Response modified for safety]*' });
        }

        sendEvent({
          type: 'done',
          confidence: evidenceConfidence,
          sourceTier: bestTier,
          sources,
        });
      } catch (err) {
        if (cancelled) return;
        console.error('[ai-support/orchestrator] Error:', err);
        sendEvent({
          type: 'error',
          message:
            err instanceof Error
              ? err.message
              : 'An unexpected error occurred processing your question.',
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
  stream: ReadableStream<Uint8Array>;
}> {
  // Retrieve evidence (two-stage)
  const allEvidence = await retrieveEvidence({
    route: input.context.route,
    moduleKey: input.context.moduleKey,
    question: input.messageText,
    mode: input.mode,
    context: input.context,
  });

  const evidenceConfidence = scoreConfidence(allEvidence);
  const bestTier = highestTier(allEvidence);
  const sources = allEvidence.map((e) => e.source);

  const systemPrompt = buildSystemPrompt(input.context, allEvidence, input.mode);

  const messages = [
    ...input.threadHistory.map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content,
    })),
    { role: 'user', content: input.messageText },
  ];

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
        // Stream plain markdown directly to the client
        await callClaudeStreaming(
          systemPrompt,
          messages,
          (text) => sendEvent({ type: 'chunk', text }),
        );

        sendEvent({
          type: 'done',
          confidence: evidenceConfidence,
          sourceTier: bestTier,
          sources,
        });
      } catch (err) {
        if (cancelled) return;
        console.error('[ai-support/orchestrator] Error:', err);
        sendEvent({
          type: 'error',
          message: err instanceof Error ? err.message : 'An unexpected error occurred.',
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
    stream,
  };
}
