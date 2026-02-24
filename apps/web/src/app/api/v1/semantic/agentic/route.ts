import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { runAgenticAnalysis } from '@oppsera/module-semantic/intelligence/agentic-orchestrator';
import { buildRegistryCatalog } from '@oppsera/module-semantic/registry';
import { buildSchemaCatalog } from '@oppsera/module-semantic/schema/schema-catalog';
import { checkSemanticRateLimit } from '@oppsera/module-semantic/cache';

// ── Validation ────────────────────────────────────────────────────

const agenticSchema = z.object({
  question: z.string().min(1).max(2000),
  maxSteps: z.number().int().min(2).max(5).default(5),
});

// ── POST /api/v1/semantic/agentic ─────────────────────────────────
// Multi-step agentic analysis. Decomposes a complex business question
// into 2-5 sub-queries, executes them, and synthesizes a final answer.
// Rate limited: consumes significantly more LLM tokens than /ask.

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    // Rate limiting — agentic queries are expensive (multiple LLM calls)
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
    const parsed = agenticSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const { question, maxSteps } = parsed.data;

    // Build catalogs for the agentic context
    const [schemaCatalog, registryCatalog] = await Promise.all([
      buildSchemaCatalog(),
      buildRegistryCatalog(),
    ]);

    const currentDate = new Date().toISOString().split('T')[0]!;

    try {
      const result = await runAgenticAnalysis(
        ctx.tenantId,
        question,
        {
          tenantId: ctx.tenantId,
          locationId: ctx.locationId ?? undefined,
          userId: ctx.user.id,
          userRole: ctx.user.membershipStatus ?? 'staff',
          sessionId: `agentic-${ctx.tenantId}-${Date.now()}`,
          currentDate,
          timezone: 'UTC',
          maxSteps,
          schemaCatalog,
          registryCatalog,
        },
      );

      return NextResponse.json({
        data: {
          steps: result.steps.map((s) => ({
            stepNumber: s.stepNumber,
            thought: s.thought,
            action: s.action,
            query: s.query,
            rowCount: s.result?.rowCount ?? null,
            rows: s.result?.rows ?? [],
            insight: s.insight,
          })),
          finalAnswer: result.finalAnswer,
          totalTokens: result.totalTokens,
          totalLatencyMs: result.totalLatencyMs,
          stepCount: result.stepCount,
        },
      });
    } catch (err) {
      console.error('[semantic/agentic] Analysis error:', err);
      return NextResponse.json(
        { error: { code: 'AGENTIC_ERROR', message: 'Unable to complete the multi-step analysis. Please try a simpler question or try again later.' } },
        { status: 500 },
      );
    }
  },
  { entitlement: 'semantic', permission: 'semantic.view' },
);
