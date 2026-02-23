import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { runPipeline } from '@oppsera/module-semantic/llm';

// ── Validation ────────────────────────────────────────────────────

const semanticQuerySchema = z.object({
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

// ── POST /api/v1/semantic/query ───────────────────────────────────
// Raw data mode: resolves intent, compiles, and executes SQL.
// Returns structured data rows without a narrative summary.
// Use this for programmatic integrations and API consumers.

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = semanticQuerySchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const { message, sessionId, turnNumber, history, lensSlug, timezone } = parsed.data;

    // Current date in tenant timezone (or UTC if not specified)
    const currentDate = new Date().toLocaleDateString('en-CA', {
      timeZone: timezone,
    }); // en-CA → YYYY-MM-DD format

    const output = await runPipeline({
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
      skipNarrative: true,
    });

    // Capture the turn number — pipeline hardcodes 1; we expose it for callers
    // (the capture service ignores duplicates if sessionId+turnNumber already exists)
    void turnNumber; // acknowledged: pipeline handles capture internally

    return NextResponse.json({
      data: {
        plan: output.plan,
        rows: output.data?.rows ?? [],
        rowCount: output.data?.rowCount ?? 0,
        executionTimeMs: output.data?.executionTimeMs ?? null,
        truncated: output.data?.truncated ?? false,
        isClarification: output.isClarification,
        clarificationText: output.clarificationText,
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
  { entitlement: 'semantic', permission: 'semantic.query' , writeAccess: true },
);
