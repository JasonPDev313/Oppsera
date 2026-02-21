import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { runPipeline } from '@oppsera/module-semantic/llm';
import { checkSemanticRateLimit } from '@oppsera/module-semantic/cache';

// ── Validation ────────────────────────────────────────────────────

const semanticAskSchema = z.object({
  message: z.string().min(1).max(2000),
  sessionId: z.string().min(1).max(128),
  turnNumber: z.number().int().positive().default(1),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(4000),
      }),
    )
    .max(20)
    .optional(),
  lensSlug: z.string().max(64).optional(),
  timezone: z.string().max(64).default('UTC'),
});

// ── POST /api/v1/semantic/ask ─────────────────────────────────────
// Conversational mode: resolves intent, compiles, executes, and generates
// a human-readable narrative response in markdown.
// Use this for the chat UI and AI assistant features.

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    // Rate limiting — 30 semantic queries per minute per tenant
    const rateLimit = checkSemanticRateLimit(ctx.tenantId);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: { code: 'RATE_LIMITED', message: 'Too many semantic queries. Please wait before trying again.' } },
        {
          status: 429,
          headers: {
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(rateLimit.resetAt / 1000)),
            'Retry-After': String(Math.ceil(rateLimit.retryAfterMs / 1000)),
          },
        },
      );
    }

    const body = await request.json();
    const parsed = semanticAskSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const { message, sessionId, history, lensSlug, timezone } = parsed.data;

    const currentDate = new Date().toLocaleDateString('en-CA', {
      timeZone: timezone,
    });

    let output;
    try {
      output = await runPipeline({
        message,
        context: {
          tenantId: ctx.tenantId,
          locationId: ctx.locationId,
          userId: ctx.user.id,
          userRole: ctx.user.membershipStatus ?? 'staff',
          sessionId,
          lensSlug,
          history,
          currentDate,
          timezone,
        },
        skipNarrative: false,
      });
    } catch (err) {
      console.error('[semantic/ask] Pipeline error:', err);
      return NextResponse.json(
        { error: { code: 'PIPELINE_ERROR', message: err instanceof Error ? err.message : 'Semantic pipeline failed' } },
        { status: 500 },
      );
    }

    // If the pipeline returned with compilation errors and no narrative, log it
    if (output.compilationErrors.length > 0) {
      console.warn('[semantic/ask] Pipeline returned with errors:', output.compilationErrors);
    }

    return NextResponse.json({
      data: {
        // Narrative response
        narrative: output.narrative,
        sections: output.sections,

        // Underlying plan + data (for data explorer UI)
        plan: output.plan,
        rows: output.data?.rows ?? [],
        rowCount: output.data?.rowCount ?? 0,
        executionTimeMs: output.data?.executionTimeMs ?? null,
        truncated: output.data?.truncated ?? false,

        // Conversational state
        isClarification: output.isClarification,
        clarificationText: output.clarificationText,

        // Eval turn — used by FeedbackWidget to submit user ratings
        evalTurnId: output.evalTurnId ?? null,

        // Metadata
        compiledSql: output.compiledSql,
        compilationErrors: output.compilationErrors,
        tablesAccessed: output.tablesAccessed,
        llmConfidence: output.llmConfidence,
        llmLatencyMs: output.llmLatencyMs,
        provider: output.provider,
        model: output.model,
        cacheStatus: output.cacheStatus,
      },
    });
  },
  { entitlement: 'semantic', permission: 'semantic.query' },
);
