import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the retrieval module before imports ───────────────────────────────

vi.mock('../services/retrieval', () => ({
  retrieveEvidence: vi.fn(),
}));

// ── Mock fetch (Claude API) ────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Now import the mocked modules ─────────────────────────────────────────

import { retrieveEvidence } from '../services/retrieval';
import { runOrchestrator } from '../services/orchestrator';
import type { RetrievalResult } from '../services/retrieval';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeSSEResponse(jsonPayload: string): Response {
  const sseText = `data: ${JSON.stringify({ type: 'content_block_delta', delta: { text: jsonPayload } })}\n\ndata: [DONE]\n\n`;
  const encoder = new TextEncoder();
  const chunks = [encoder.encode(sseText)];
  let idx = 0;

  const stream = new ReadableStream({
    pull(controller) {
      if (idx < chunks.length) {
        controller.enqueue(chunks[idx++]);
      } else {
        controller.close();
      }
    },
  });

  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

function makeEvidence(tier: RetrievalResult['tier'], source = 'test_source'): RetrievalResult {
  return { tier, source, content: `Content from ${source}` };
}

async function collectStreamChunks(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const events: string[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value);
    for (const line of text.split('\n')) {
      if (line.startsWith('data: ')) {
        events.push(line.slice(6).trim());
      }
    }
  }
  return events.filter(Boolean);
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('orchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['ANTHROPIC_API_KEY'] = 'test-key';
  });

  const baseInput = {
    messageText: 'How do I create an order?',
    context: {
      route: '/orders',
      tenantId: 'tenant_01',
      roleKeys: ['manager'],
    },
    threadHistory: [],
    mode: 'customer' as const,
  };

  describe('confidence scoring', () => {
    it('T2 evidence produces high confidence', async () => {
      const mockEvidence = [makeEvidence('t2', 'answer_card:test')];
      vi.mocked(retrieveEvidence).mockResolvedValue(mockEvidence);

      const claudeResponse = JSON.stringify({
        answer: 'Here is the answer.',
        confidence: 'high',
        answerMode: 'guide',
        usedSources: ['answer_card:test'],
        needsReview: false,
      });
      mockFetch.mockResolvedValue(makeSSEResponse(claudeResponse));

      const stream = runOrchestrator(baseInput);
      const events = await collectStreamChunks(stream);
      const doneEvent = events.find((e) => {
        try {
          return JSON.parse(e).type === 'done';
        } catch {
          return false;
        }
      });

      expect(doneEvent).toBeDefined();
      const done = JSON.parse(doneEvent!);
      expect(done.confidence).toBe('high');
    });

    it('T4-only evidence produces medium confidence (score 0.7 < HIGH threshold 0.8)', async () => {
      const mockEvidence = [makeEvidence('t4', 'route_manifest:/orders')];
      vi.mocked(retrieveEvidence).mockResolvedValue(mockEvidence);

      const claudeResponse = JSON.stringify({
        answer: 'Based on route manifest.',
        confidence: 'medium',
        answerMode: 'explain',
        usedSources: ['route_manifest:/orders'],
        needsReview: false,
      });
      mockFetch.mockResolvedValue(makeSSEResponse(claudeResponse));

      const stream = runOrchestrator(baseInput);
      const events = await collectStreamChunks(stream);
      const doneEvent = events.find((e) => {
        try {
          return JSON.parse(e).type === 'done';
        } catch {
          return false;
        }
      });

      expect(doneEvent).toBeDefined();
      const done = JSON.parse(doneEvent!);
      // T4 score is 0.7, below HIGH threshold of 0.8 → medium
      expect(done.confidence).toBe('medium');
    });

    it('T6-only evidence produces low or medium confidence (score 0.4 < MEDIUM threshold 0.5)', async () => {
      const mockEvidence = [makeEvidence('t6', 'semantic_ref:doc1')];
      vi.mocked(retrieveEvidence).mockResolvedValue(mockEvidence);

      const claudeResponse = JSON.stringify({
        answer: 'Based on internal docs.',
        confidence: 'low',
        answerMode: 'escalate',
        usedSources: ['semantic_ref:doc1'],
        needsReview: true,
      });
      mockFetch.mockResolvedValue(makeSSEResponse(claudeResponse));

      const stream = runOrchestrator(baseInput);
      const events = await collectStreamChunks(stream);
      const doneEvent = events.find((e) => {
        try {
          return JSON.parse(e).type === 'done';
        } catch {
          return false;
        }
      });

      expect(doneEvent).toBeDefined();
      const done = JSON.parse(doneEvent!);
      // T6 score is 0.4, below MEDIUM (0.5) → low from evidence scoring
      // But Claude returned 'low' here too
      expect(['low', 'medium']).toContain(done.confidence);
    });

    it('no evidence produces low confidence', async () => {
      vi.mocked(retrieveEvidence).mockResolvedValue([]);

      const claudeResponse = JSON.stringify({
        answer: "I don't have specific information.",
        confidence: 'low',
        answerMode: 'escalate',
        usedSources: [],
        needsReview: true,
      });
      mockFetch.mockResolvedValue(makeSSEResponse(claudeResponse));

      const stream = runOrchestrator(baseInput);
      const events = await collectStreamChunks(stream);
      const doneEvent = events.find((e) => {
        try {
          return JSON.parse(e).type === 'done';
        } catch {
          return false;
        }
      });

      expect(doneEvent).toBeDefined();
      const done = JSON.parse(doneEvent!);
      expect(done.confidence).toBe('low');
    });
  });

  describe('customer mode T7 exclusion', () => {
    it('customer mode passes mode:customer to retrieval', async () => {
      vi.mocked(retrieveEvidence).mockResolvedValue([]);

      mockFetch.mockResolvedValue(makeSSEResponse(JSON.stringify({
        answer: 'ok',
        confidence: 'low',
        answerMode: 'escalate',
        usedSources: [],
        needsReview: true,
      })));

      const stream = runOrchestrator({ ...baseInput, mode: 'customer' });
      await collectStreamChunks(stream);

      expect(retrieveEvidence).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'customer' }),
      );
    });

    it('staff mode passes mode:staff to retrieval', async () => {
      vi.mocked(retrieveEvidence).mockResolvedValue([]);

      mockFetch.mockResolvedValue(makeSSEResponse(JSON.stringify({
        answer: 'ok',
        confidence: 'low',
        answerMode: 'escalate',
        usedSources: [],
        needsReview: true,
      })));

      const stream = runOrchestrator({ ...baseInput, mode: 'staff' });
      await collectStreamChunks(stream);

      expect(retrieveEvidence).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'staff' }),
      );
    });
  });

  describe('error handling', () => {
    it('Claude API errors produce an error chunk', async () => {
      vi.mocked(retrieveEvidence).mockResolvedValue([]);
      mockFetch.mockResolvedValue(new Response('Unauthorized', { status: 401 }));

      const stream = runOrchestrator(baseInput);
      const events = await collectStreamChunks(stream);

      const errorEvent = events.find((e) => {
        try {
          return JSON.parse(e).type === 'error';
        } catch {
          return false;
        }
      });

      expect(errorEvent).toBeDefined();
      const err = JSON.parse(errorEvent!);
      expect(err.message).toMatch(/Anthropic API error/);
    });

    it('missing API key produces error chunk', async () => {
      vi.mocked(retrieveEvidence).mockResolvedValue([]);
      delete process.env['ANTHROPIC_API_KEY'];

      const stream = runOrchestrator(baseInput);
      const events = await collectStreamChunks(stream);

      const errorEvent = events.find((e) => {
        try {
          return JSON.parse(e).type === 'error';
        } catch {
          return false;
        }
      });

      expect(errorEvent).toBeDefined();
    });

    it('retrieval failure produces error chunk', async () => {
      vi.mocked(retrieveEvidence).mockRejectedValue(new Error('DB connection failed'));

      const stream = runOrchestrator(baseInput);
      const events = await collectStreamChunks(stream);

      const errorEvent = events.find((e) => {
        try {
          return JSON.parse(e).type === 'error';
        } catch {
          return false;
        }
      });

      expect(errorEvent).toBeDefined();
    });
  });

  describe('prompt building', () => {
    it('builds prompt with evidence context', async () => {
      const mockEvidence = [makeEvidence('t2', 'answer_card:orders-create')];
      vi.mocked(retrieveEvidence).mockResolvedValue(mockEvidence);

      let capturedBody: unknown;
      mockFetch.mockImplementation((_url: string, opts: RequestInit) => {
        capturedBody = JSON.parse(opts.body as string);
        return Promise.resolve(makeSSEResponse(JSON.stringify({
          answer: 'Here is how.',
          confidence: 'high',
          answerMode: 'guide',
          usedSources: [],
          needsReview: false,
        })));
      });

      const stream = runOrchestrator(baseInput);
      await collectStreamChunks(stream);

      expect(capturedBody).toBeDefined();
      const body = capturedBody as Record<string, unknown>;
      expect(typeof body['system']).toBe('string');
      const systemPrompt = body['system'] as string;
      expect(systemPrompt).toContain('evidence');
      expect(systemPrompt).toContain('answer_card:orders-create');
    });

    it('includes no-evidence message when no evidence found', async () => {
      vi.mocked(retrieveEvidence).mockResolvedValue([]);

      let capturedBody: unknown;
      mockFetch.mockImplementation((_url: string, opts: RequestInit) => {
        capturedBody = JSON.parse(opts.body as string);
        return Promise.resolve(makeSSEResponse(JSON.stringify({
          answer: 'unknown',
          confidence: 'low',
          answerMode: 'escalate',
          usedSources: [],
          needsReview: true,
        })));
      });

      const stream = runOrchestrator(baseInput);
      await collectStreamChunks(stream);

      const body = capturedBody as Record<string, unknown>;
      const systemPrompt = body['system'] as string;
      expect(systemPrompt).toContain('no-evidence');
    });
  });

  describe('follow-up model routing', () => {
    it('first message with no evidence uses deep tier (Opus)', async () => {
      vi.mocked(retrieveEvidence).mockResolvedValue([]);

      let capturedBody: unknown;
      mockFetch.mockImplementation((_url: string, opts: RequestInit) => {
        capturedBody = JSON.parse(opts.body as string);
        return Promise.resolve(makeSSEResponse('Test response'));
      });

      const stream = runOrchestrator({
        ...baseInput,
        mode: 'staff',
        threadHistory: [], // First message — no history
      });
      await collectStreamChunks(stream);

      const body = capturedBody as Record<string, unknown>;
      // No evidence + no history → low confidence → deep tier
      expect(body['model']).toBe('claude-opus-4-6');
    });

    it('follow-up with no evidence floors to standard tier (Sonnet), not deep', async () => {
      vi.mocked(retrieveEvidence).mockResolvedValue([]);

      let capturedBody: unknown;
      mockFetch.mockImplementation((_url: string, opts: RequestInit) => {
        capturedBody = JSON.parse(opts.body as string);
        return Promise.resolve(makeSSEResponse('Test response'));
      });

      const stream = runOrchestrator({
        ...baseInput,
        mode: 'staff',
        threadHistory: [
          { role: 'user', content: 'What is inventory?' },
          { role: 'assistant', content: 'Inventory tracks stock levels.' },
        ],
        // No priorConfidence → continuation floor
      });
      await collectStreamChunks(stream);

      const body = capturedBody as Record<string, unknown>;
      // Follow-up + no evidence → floored to medium → standard tier (Sonnet)
      expect(body['model']).toBe('claude-sonnet-4-6');
    });

    it('follow-up with prior high confidence floors to standard tier', async () => {
      vi.mocked(retrieveEvidence).mockResolvedValue([]);

      let capturedBody: unknown;
      mockFetch.mockImplementation((_url: string, opts: RequestInit) => {
        capturedBody = JSON.parse(opts.body as string);
        return Promise.resolve(makeSSEResponse('Test response'));
      });

      const stream = runOrchestrator({
        ...baseInput,
        mode: 'staff',
        threadHistory: [
          { role: 'user', content: 'How do I create an order?' },
          { role: 'assistant', content: 'Go to Orders > New Order.' },
        ],
        priorConfidence: 'high',
      });
      await collectStreamChunks(stream);

      const body = capturedBody as Record<string, unknown>;
      // Follow-up + prior high confidence → floored to medium → Sonnet
      expect(body['model']).toBe('claude-sonnet-4-6');
    });

    it('follow-up with high evidence still uses fast tier (Haiku)', async () => {
      const mockEvidence = [makeEvidence('t2', 'answer_card:inventory')];
      vi.mocked(retrieveEvidence).mockResolvedValue(mockEvidence);

      let capturedBody: unknown;
      mockFetch.mockImplementation((_url: string, opts: RequestInit) => {
        capturedBody = JSON.parse(opts.body as string);
        return Promise.resolve(makeSSEResponse('Test response'));
      });

      const stream = runOrchestrator({
        ...baseInput,
        mode: 'staff',
        threadHistory: [
          { role: 'user', content: 'What is inventory?' },
          { role: 'assistant', content: 'Inventory tracks stock levels.' },
        ],
        priorConfidence: 'high',
      });
      await collectStreamChunks(stream);

      const body = capturedBody as Record<string, unknown>;
      // Follow-up with T2 evidence → high confidence → fast tier (Haiku)
      expect(body['model']).toBe('claude-haiku-4-5-20251001');
    });

    it('first message with no evidence in customer mode uses deep tier', async () => {
      vi.mocked(retrieveEvidence).mockResolvedValue([]);

      let capturedBody: unknown;
      mockFetch.mockImplementation((_url: string, opts: RequestInit) => {
        capturedBody = JSON.parse(opts.body as string);
        return Promise.resolve(makeSSEResponse('Test response'));
      });

      const stream = runOrchestrator({
        ...baseInput,
        mode: 'customer',
        threadHistory: [],
      });
      await collectStreamChunks(stream);

      const body = capturedBody as Record<string, unknown>;
      // No evidence + no history + customer mode → deep
      expect(body['model']).toBe('claude-opus-4-6');
    });
  });
});
