import type { LLMAdapter, LLMMessage, LLMResponse, LLMCompletionOptions } from '../types';
import { LLMError } from '../types';

// ── Anthropic adapter ─────────────────────────────────────────────
// Uses the Anthropic Messages API directly via fetch (no SDK dependency).
// SDK is optional so it can be string-concatenated at require() if needed.
// See gotcha #55: optional deps use runtime string concatenation.

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 2048;
const DEFAULT_TIMEOUT_MS = 60_000; // 60s — generous for first-request compilation in dev
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

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

    const {
      maxTokens = DEFAULT_MAX_TOKENS,
      temperature = 0,
      systemPrompt,
    } = options;

    // Separate system message from conversation
    const systemMessages = messages.filter((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');

    const systemText = [
      systemPrompt,
      ...systemMessages.map((m) => m.content),
    ]
      .filter(Boolean)
      .join('\n\n');

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: maxTokens,
      temperature,
      messages: conversationMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    };

    if (systemText) {
      body.system = systemText;
    }

    let response: Response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        // Opt out of Next.js fetch patching — we need raw Node fetch behavior
        cache: 'no-store',
      } as RequestInit);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new LLMError(
          `Anthropic API timed out after ${DEFAULT_TIMEOUT_MS}ms`,
          'PROVIDER_ERROR',
          true,
        );
      }
      throw new LLMError(
        `Network error calling Anthropic API: ${String(err)}`,
        'PROVIDER_ERROR',
        true,
      );
    } finally {
      clearTimeout(timeout);
    }

    const latencyMs = Date.now() - startMs;

    if (response.status === 429) {
      throw new LLMError('Anthropic rate limit exceeded', 'RATE_LIMIT', true);
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
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
