import { NextResponse } from 'next/server';

// Temporary diagnostic endpoint — no auth required.
// Tests each step of the semantic pipeline in isolation.
// DELETE THIS FILE after debugging.

export async function GET() {
  const results: Record<string, unknown> = {};
  const start = Date.now();

  // Step 0: Check env vars
  results.anthropicKey = process.env.ANTHROPIC_API_KEY
    ? `${process.env.ANTHROPIC_API_KEY.substring(0, 15)}... (${process.env.ANTHROPIC_API_KEY.length} chars)`
    : 'NOT SET';
  results.anthropicModel = process.env.ANTHROPIC_MODEL || 'not set (default: claude-sonnet-4-6)';
  results.dbUrl = process.env.DATABASE_URL
    ? `${process.env.DATABASE_URL.substring(0, 30)}...`
    : 'NOT SET';

  // Step 1: Test DB via registry load
  const step1Start = Date.now();
  try {
    const { buildRegistryCatalog } = await import('@oppsera/module-semantic/registry');
    const catalog = await buildRegistryCatalog();
    results.registryLoad = {
      ok: true,
      timeMs: Date.now() - step1Start,
      metrics: catalog.metrics.length,
      dimensions: catalog.dimensions.length,
    };
  } catch (e) {
    results.registryLoad = {
      ok: false,
      timeMs: Date.now() - step1Start,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  // Step 2: Test LLM adapter instantiation
  try {
    const { getLLMAdapter } = await import('@oppsera/module-semantic/llm');
    const adapter = getLLMAdapter();
    results.llmAdapter = {
      ok: true,
      provider: adapter.provider,
      model: adapter.model,
    };

    // Step 3: Test actual LLM call
    const step3Start = Date.now();
    try {
      const response = await adapter.complete(
        [{ role: 'user', content: 'Say "hello" in one word' }],
        { maxTokens: 10, temperature: 0 },
      );
      results.llmCall = {
        ok: true,
        timeMs: Date.now() - step3Start,
        content: response.content.substring(0, 100),
        tokensIn: response.tokensInput,
        tokensOut: response.tokensOutput,
        model: response.model,
      };
    } catch (e) {
      results.llmCall = {
        ok: false,
        timeMs: Date.now() - step3Start,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  } catch (e) {
    results.llmAdapter = {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  results.totalTimeMs = Date.now() - start;

  return NextResponse.json(results, { status: 200 });
}
