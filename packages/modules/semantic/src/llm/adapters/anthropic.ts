import type { LLMAdapter, LLMMessage, LLMResponse, LLMCompletionOptions } from '../types';
import { LLMError } from '../types';
import {
  acquireCircuit,
  recordOutcome,
  acquireConcurrencySlot,
  releaseConcurrencySlot,
  CircuitOpenError,
} from './resilience';

// ── Anthropic adapter ─────────────────────────────────────────────
// Uses the Anthropic Messages API directly via fetch (no SDK dependency).
// SDK is optional so it can be string-concatenated at require() if needed.
// See gotcha #55: optional deps use runtime string concatenation.

const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';
const FAST_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_MAX_TOKENS = 2048;
const DEFAULT_TIMEOUT_MS = 60_000; // 60s — generous for first-request compilation in dev
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_RETRIES = 2; // retry up to 2 times on transient errors (429, 529, 503)
const BASE_RETRY_DELAY_MS = 1_000; // 1s base delay, doubles each retry

/** The fast model ID for structured JSON output (intent resolution, SQL generation) */
export const SEMANTIC_FAST_MODEL = process.env.ANTHROPIC_FAST_MODEL ?? FAST_MODEL;

export class AnthropicAdapter implements LLMAdapter {
  readonly provider = 'anthropic';
  readonly model: string;

  private apiKey: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey ?? process.env.ANTHROPIC_API_KEY ?? '';
    this.model = model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;

    if (!this.apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required for AnthropicAdapter');
    }
  }

  async complete(messages: LLMMessage[], options: LLMCompletionOptions = {}): Promise<LLMResponse> {
    const startMs = Date.now();

    // ── Circuit breaker check (fast-fail when API is down) ──
    try {
      acquireCircuit();
    } catch (err) {
      if (err instanceof CircuitOpenError) {
        throw new LLMError(
          `LLM API circuit breaker is OPEN — retry after ${Math.ceil(err.retryAfterMs / 1000)}s`,
          'RATE_LIMIT',
          true,
        );
      }
      throw err;
    }

    // ── Concurrency limiter (backpressure when at capacity) ──
    await acquireConcurrencySlot();

    try {
      return await this._completeWithRetry(messages, options, startMs);
    } finally {
      releaseConcurrencySlot();
    }
  }

  private async _completeWithRetry(
    messages: LLMMessage[],
    options: LLMCompletionOptions,
    startMs: number,
  ): Promise<LLMResponse> {
    const {
      maxTokens = DEFAULT_MAX_TOKENS,
      temperature = 0,
      systemPrompt,
      systemPromptParts,
      model: modelOverride,
      timeoutMs,
    } = options;

    const effectiveModel = modelOverride ?? this.model;

    // Separate system message from conversation
    const systemMessages = messages.filter((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');

    // ── Build system prompt (SEM-02: prompt caching support) ──
    // When `systemPromptParts` is provided, send as an array of content blocks
    // with optional `cache_control` markers for Anthropic's server-side caching.
    // Falls back to plain string `system` field for backward compat.
    let usePromptCaching = false;
    let systemPayload: unknown = undefined;

    if (systemPromptParts && systemPromptParts.length > 0) {
      // Structured parts with cache_control support
      usePromptCaching = systemPromptParts.some((p) => p.cacheControl);
      const extraSystemText = systemMessages.map((m) => m.content).join('\n\n');
      const parts: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> = [];
      for (const part of systemPromptParts) {
        parts.push({
          type: 'text',
          text: part.text,
          ...(part.cacheControl ? { cache_control: { type: 'ephemeral' } } : {}),
        });
      }
      // Append any inline system messages as a final non-cached block
      if (extraSystemText) {
        parts.push({ type: 'text', text: extraSystemText });
      }
      systemPayload = parts;
    } else {
      // Legacy: plain string system prompt
      const systemText = [
        systemPrompt,
        ...systemMessages.map((m) => m.content),
      ]
        .filter(Boolean)
        .join('\n\n');
      if (systemText) {
        systemPayload = systemText;
      }
    }

    const bodyObj: Record<string, unknown> = {
      model: effectiveModel,
      max_tokens: maxTokens,
      temperature,
      messages: conversationMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    };

    if (systemPayload !== undefined) {
      bodyObj.system = systemPayload;
    }

    const bodyJson = JSON.stringify(bodyObj);
    const effectiveTimeout = timeoutMs ?? DEFAULT_TIMEOUT_MS;

    // ── Retry loop with exponential backoff for transient errors ──
    let lastError: LLMError | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // Respect overall timeout budget — don't start a retry if we're almost out of time
      const elapsedMs = Date.now() - startMs;
      if (attempt > 0 && elapsedMs > effectiveTimeout * 0.8) {
        break; // not enough time for another attempt
      }

      // Exponential backoff: 1s, 2s (with jitter)
      if (attempt > 0) {
        const baseDelay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        const jitter = Math.random() * 500;
        const delay = Math.min(baseDelay + jitter, 5_000);
        console.log(`[anthropic] Retry ${attempt}/${MAX_RETRIES} after ${Math.round(delay)}ms delay...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      let response: Response;
      const controller = new AbortController();
      const remainingMs = effectiveTimeout - (Date.now() - startMs);
      const attemptTimeout = setTimeout(() => controller.abort(), Math.max(remainingMs, 5_000));

      try {
        response = await fetch(ANTHROPIC_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
            ...(usePromptCaching ? { 'anthropic-beta': 'prompt-caching-2024-07-31' } : {}),
          },
          body: bodyJson,
          signal: controller.signal,
          // Opt out of Next.js fetch patching — we need raw Node fetch behavior
          cache: 'no-store',
        } as RequestInit);
      } catch (err) {
        clearTimeout(attemptTimeout);
        if (err instanceof Error && err.name === 'AbortError') {
          lastError = new LLMError(
            `Anthropic API timed out after ${effectiveTimeout}ms`,
            'PROVIDER_ERROR',
            true,
          );
          continue; // retry on timeout
        }
        lastError = new LLMError(
          `Network error calling Anthropic API: ${String(err)}`,
          'PROVIDER_ERROR',
          true,
        );
        continue; // retry on network errors
      } finally {
        clearTimeout(attemptTimeout);
      }

      // ── Retryable status codes: 429, 529, 503 ──
      if (response.status === 429 || response.status === 529 || response.status === 503) {
        const retryAfterHeader = response.headers.get('retry-after');
        const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 0;
        const code = response.status === 429 ? 'RATE_LIMIT' as const : 'PROVIDER_ERROR' as const;
        lastError = new LLMError(
          `Anthropic API ${response.status}${retryAfterSec ? ` (retry-after: ${retryAfterSec}s)` : ''}`,
          code,
          true,
        );
        console.warn(`[anthropic] ${response.status} on attempt ${attempt + 1}/${MAX_RETRIES + 1}`);

        // If server says retry-after and we have budget, wait that long instead
        if (retryAfterSec > 0 && attempt < MAX_RETRIES) {
          const serverDelay = Math.min(retryAfterSec * 1000, 10_000);
          if (Date.now() - startMs + serverDelay < effectiveTimeout * 0.9) {
            await new Promise((resolve) => setTimeout(resolve, serverDelay));
          }
        }
        continue;
      }

      const latencyMs = Date.now() - startMs;

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        // Non-retryable client errors (400, 401, 403, etc.) — throw immediately
        throw new LLMError(
          `Anthropic API error ${response.status}: ${errorText}`,
          'PROVIDER_ERROR',
          response.status >= 500,
        );
      }

      const data = await response.json() as {
        content: Array<{ type: string; text: string }>;
        usage: { input_tokens: number; output_tokens: number };
        model: string;
        stop_reason: string;
      };

      const textContent = data.content.find((c) => c.type === 'text');
      if (!textContent) {
        throw new LLMError('No text content in Anthropic response', 'PARSE_ERROR');
      }

      recordOutcome(true); // ← circuit breaker: success
      return {
        content: textContent.text,
        tokensInput: data.usage.input_tokens,
        tokensOutput: data.usage.output_tokens,
        model: data.model,
        provider: 'anthropic',
        latencyMs,
        stopReason: data.stop_reason,
      };
    }

    // All retries exhausted — record failure for circuit breaker
    recordOutcome(false);
    throw lastError ?? new LLMError('Anthropic API failed after all retries', 'PROVIDER_ERROR', true);
  }

  // ── Streaming completion ────────────────────────────────────────
  // Sends `stream: true` to the Anthropic Messages API and parses
  // server-sent `content_block_delta` events, yielding text chunks via
  // the `onChunk` callback. Returns the full accumulated LLMResponse
  // (identical shape to `complete()`) for caching and eval capture.

  async completeStreaming(
    messages: LLMMessage[],
    onChunk: (text: string) => void,
    options: LLMCompletionOptions = {},
  ): Promise<LLMResponse> {
    const startMs = Date.now();

    try {
      acquireCircuit();
    } catch (err) {
      if (err instanceof CircuitOpenError) {
        throw new LLMError(
          `LLM API circuit breaker is OPEN — retry after ${Math.ceil(err.retryAfterMs / 1000)}s`,
          'RATE_LIMIT',
          true,
        );
      }
      throw err;
    }

    await acquireConcurrencySlot();

    try {
      return await this._completeStreamingInner(messages, onChunk, options, startMs);
    } finally {
      releaseConcurrencySlot();
    }
  }

  private async _completeStreamingInner(
    messages: LLMMessage[],
    onChunk: (text: string) => void,
    options: LLMCompletionOptions,
    startMs: number,
  ): Promise<LLMResponse> {
    const {
      maxTokens = DEFAULT_MAX_TOKENS,
      temperature = 0,
      systemPrompt,
      systemPromptParts,
      model: modelOverride,
      timeoutMs,
    } = options;

    const effectiveModel = modelOverride ?? this.model;

    const systemMessages = messages.filter((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');

    // Build system payload (reuses same SEM-02 prompt caching logic)
    let usePromptCaching = false;
    let systemPayload: unknown = undefined;

    if (systemPromptParts && systemPromptParts.length > 0) {
      usePromptCaching = systemPromptParts.some((p) => p.cacheControl);
      const extraSystemText = systemMessages.map((m) => m.content).join('\n\n');
      const parts: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> = [];
      for (const part of systemPromptParts) {
        parts.push({
          type: 'text',
          text: part.text,
          ...(part.cacheControl ? { cache_control: { type: 'ephemeral' } } : {}),
        });
      }
      if (extraSystemText) {
        parts.push({ type: 'text', text: extraSystemText });
      }
      systemPayload = parts;
    } else {
      const systemText = [systemPrompt, ...systemMessages.map((m) => m.content)]
        .filter(Boolean)
        .join('\n\n');
      if (systemText) {
        systemPayload = systemText;
      }
    }

    const bodyObj: Record<string, unknown> = {
      model: effectiveModel,
      max_tokens: maxTokens,
      temperature,
      stream: true,
      messages: conversationMessages.map((m) => ({ role: m.role, content: m.content })),
    };
    if (systemPayload !== undefined) {
      bodyObj.system = systemPayload;
    }

    const effectiveTimeout = timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const attemptTimeout = setTimeout(() => controller.abort(), effectiveTimeout);

    let response: Response;
    try {
      response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          ...(usePromptCaching ? { 'anthropic-beta': 'prompt-caching-2024-07-31' } : {}),
        },
        body: JSON.stringify(bodyObj),
        signal: controller.signal,
        cache: 'no-store',
      } as RequestInit);
    } catch (err) {
      clearTimeout(attemptTimeout);
      recordOutcome(false);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new LLMError(`Anthropic streaming timed out after ${effectiveTimeout}ms`, 'PROVIDER_ERROR', true);
      }
      throw new LLMError(`Network error calling Anthropic streaming: ${String(err)}`, 'PROVIDER_ERROR', true);
    }

    if (!response.ok) {
      clearTimeout(attemptTimeout);
      const errorText = await response.text().catch(() => '');
      recordOutcome(false);
      throw new LLMError(`Anthropic streaming error ${response.status}: ${errorText}`, 'PROVIDER_ERROR', response.status >= 500);
    }

    // ── Parse SSE stream from Anthropic ──
    const reader = response.body?.getReader();
    if (!reader) {
      clearTimeout(attemptTimeout);
      recordOutcome(false);
      throw new LLMError('Anthropic streaming response has no readable body', 'PROVIDER_ERROR');
    }

    const decoder = new TextDecoder();
    let accumulated = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let modelName = effectiveModel;
    let stopReason = 'end_turn';
    let sseBuffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });

        // Process complete SSE lines (split by double newline)
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop() ?? ''; // keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;

          let event: Record<string, unknown>;
          try {
            event = JSON.parse(jsonStr) as Record<string, unknown>;
          } catch {
            continue; // skip malformed JSON
          }

          const eventType = event.type as string;

          if (eventType === 'content_block_delta') {
            const delta = event.delta as { type: string; text?: string } | undefined;
            if (delta?.type === 'text_delta' && delta.text) {
              accumulated += delta.text;
              onChunk(delta.text);
            }
          } else if (eventType === 'message_start') {
            const msg = event.message as { model?: string; usage?: { input_tokens: number } } | undefined;
            if (msg?.model) modelName = msg.model;
            if (msg?.usage?.input_tokens) inputTokens = msg.usage.input_tokens;
          } else if (eventType === 'message_delta') {
            const delta = event.delta as { stop_reason?: string } | undefined;
            const usage = event.usage as { output_tokens?: number } | undefined;
            if (delta?.stop_reason) stopReason = delta.stop_reason;
            if (usage?.output_tokens) outputTokens = usage.output_tokens;
          }
        }
      }
    } finally {
      clearTimeout(attemptTimeout);
      reader.releaseLock();
    }

    recordOutcome(true);
    return {
      content: accumulated,
      tokensInput: inputTokens,
      tokensOutput: outputTokens,
      model: modelName,
      provider: 'anthropic',
      latencyMs: Date.now() - startMs,
      stopReason,
    };
  }
}

// ── Singleton getter/setter ───────────────────────────────────────

let _adapter: LLMAdapter | null = null;

export function getLLMAdapter(): LLMAdapter {
  if (!_adapter) {
    _adapter = new AnthropicAdapter();
  }
  return _adapter;
}

export function setLLMAdapter(adapter: LLMAdapter): void {
  _adapter = adapter;
}
