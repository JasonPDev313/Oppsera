import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { runPipelineStreaming } from '@oppsera/module-semantic/llm';
import type { SSEEvent } from '@oppsera/module-semantic/llm';
import { checkSemanticRateLimit } from '@oppsera/module-semantic/cache';

// ── Vercel serverless timeout — allow up to 60s for the streaming pipeline ──
export const maxDuration = 60;

// ── Validation (identical to non-streaming /ask route) ──────────────

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

// ── POST /api/v1/semantic/ask/stream ────────────────────────────────
// SSE streaming variant of /ask. Returns a text/event-stream response
// that progressively emits pipeline events (status, intent, data,
// narrative chunks, enrichments, and the final complete event).
// The frontend consumes via fetch() + ReadableStream reader.

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    // Rate limiting — same rules as non-streaming
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

    // Build the SSE ReadableStream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: SSEEvent) => {
          const line = `data: ${JSON.stringify(event)}\n\n`;
          try {
            controller.enqueue(encoder.encode(line));
          } catch {
            // Stream may already be closed if client disconnected
          }
        };

        try {
          await runPipelineStreaming(
            {
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
              stream: true,
            },
            { onEvent: sendEvent },
          );
        } catch (err) {
          // runPipelineStreaming already emits its own SSE error event,
          // so this catch is a safety net for truly unexpected errors only.
          console.error('[semantic/ask/stream] Unexpected error (pipeline should have handled):', err);
          // Only emit if the pipeline didn't already emit an error
          sendEvent({
            type: 'error',
            data: { code: 'PIPELINE_ERROR', message: err instanceof Error ? err.message : 'Unable to process your query. Please try rephrasing or try again later.' },
          });
        } finally {
          try {
            controller.close();
          } catch {
            // Already closed
          }
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    }) as NextResponse<unknown>;
  },
  { entitlement: 'semantic', permission: 'semantic.query' },
);
