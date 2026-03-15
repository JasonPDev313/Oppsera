import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { db, aiAssistantMessages } from '@oppsera/db';
import { eq } from 'drizzle-orm';
import {
  getThreadMessages,
  sendMessage,
  SendMessageSchema,
  maybeCreateDraftAnswerCard,
  maybeRecordFeatureGap,
} from '@oppsera/module-ai-support';

// Vercel serverless timeout — allow up to 60s for streaming LLM responses
export const maxDuration = 60;

function extractThreadId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  const idx = parts.indexOf('threads');
  return parts[idx + 1]!;
}

// GET /api/v1/ai-support/threads/:threadId/messages — paginated message history
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const threadId = extractThreadId(request);
    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 50;

    const result = await getThreadMessages({
      tenantId: ctx.tenantId,
      userId: ctx.user.id,
      threadId,
      cursor,
      limit,
    });

    return NextResponse.json({
      data: result.messages,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'ai_support', permission: 'ai_support.chat' },
);

/**
 * Metadata needed by post-stream logic (auto-draft + feature gap detection).
 */
interface StreamPersistenceMeta {
  tenantId: string;
  question: string;
  confidence: 'high' | 'medium' | 'low';
  sourceTier: string;
  moduleKey?: string | null;
  route?: string | null;
  /** 0 = first question in thread, >0 = follow-up (skipped by auto-draft) */
  messageIndex: number;
  threadId?: string;
}

/**
 * Wraps the orchestrator SSE stream to capture all chunk text.
 * After the stream ends, persists the full assistant answer to DB,
 * replacing the "[streaming]" placeholder, then evaluates for auto-draft.
 */
function wrapStreamWithPersistence(
  stream: ReadableStream<Uint8Array>,
  assistantMessageId: string,
  meta?: StreamPersistenceMeta,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  let collectedText = '';
  let lineBuffer = ''; // Carry over partial lines between chunks

  return stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        // Pass through to client unchanged
        controller.enqueue(chunk);

        // Parse SSE lines to capture chunk text (with line carry-over)
        lineBuffer += decoder.decode(chunk, { stream: true });
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() ?? ''; // Last element may be partial — carry over

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(line.slice(6).trim()) as { type: string; text?: string };
            if (parsed.type === 'chunk' && parsed.text) {
              collectedText += parsed.text;
            }
          } catch {
            // skip unparseable
          }
        }
      },
      async flush() {
        // Process any remaining buffered line
        if (lineBuffer.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(lineBuffer.slice(6).trim()) as { type: string; text?: string };
            if (parsed.type === 'chunk' && parsed.text) {
              collectedText += parsed.text;
            }
          } catch {
            // skip
          }
        }

        // Stream is done — persist the collected answer to DB
        // Strip the safety notice suffix if present (appended by content guard)
        const persistText = collectedText.replace(
          /\n\n---\n\*\[Response modified for safety\]\*$/,
          '',
        );
        if (persistText) {
          try {
            await db
              .update(aiAssistantMessages)
              .set({ messageText: persistText })
              .where(eq(aiAssistantMessages.id, assistantMessageId));
          } catch (err) {
            console.error('[ai-support] Failed to persist assistant message:', err);
          }

          // Auto-draft: evaluate the answer for potential draft answer card
          if (meta) {
            try {
              await maybeCreateDraftAnswerCard({
                tenantId: meta.tenantId,
                question: meta.question,
                answerText: persistText,
                confidence: meta.confidence,
                sourceTier: meta.sourceTier as 't1' | 't2' | 't3' | 't4' | 't5' | 't6' | 't7',
                moduleKey: meta.moduleKey,
                route: meta.route,
                messageIndex: meta.messageIndex,
              });
            } catch (err) {
              console.error('[ai-support] Auto-draft evaluation failed:', err);
            }

            // Feature gap detection: record questions the AI couldn't answer well
            try {
              await maybeRecordFeatureGap(
                {
                  tenantId: meta.tenantId,
                  question: meta.question,
                  confidence: meta.confidence,
                  sourceTier: meta.sourceTier,
                  moduleKey: meta.moduleKey,
                  route: meta.route,
                  threadId: meta.threadId,
                  messageIndex: meta.messageIndex,
                },
                persistText,
              );
            } catch (err) {
              console.error('[ai-support] Feature gap detection failed:', err);
            }
          }
        } else {
          // No text collected — update placeholder to indicate empty response
          try {
            await db
              .update(aiAssistantMessages)
              .set({ messageText: '[No response generated]' })
              .where(eq(aiAssistantMessages.id, assistantMessageId));
          } catch (err) {
            console.error('[ai-support] Failed to update empty assistant message:', err);
          }
        }
      },
    }),
  );
}

// POST /api/v1/ai-support/threads/:threadId/messages — send message, returns SSE stream
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const threadId = extractThreadId(request);
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }

    // Inject threadId from URL into body for validation
    const inputWithThreadId = { ...(body as Record<string, unknown>), threadId };
    const parsed = SendMessageSchema.safeParse(inputWithThreadId);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await sendMessage(
      ctx,
      threadId,
      parsed.data.messageText,
      parsed.data.contextSnapshot,
    );

    // Wrap the stream to persist the full answer after streaming completes
    const persistentStream = wrapStreamWithPersistence(
      result.stream,
      result.assistantMessage.id,
      {
        tenantId: ctx.tenantId,
        question: parsed.data.messageText,
        confidence: result.confidence,
        sourceTier: result.sourceTierUsed,
        moduleKey: parsed.data.contextSnapshot.moduleKey,
        route: parsed.data.contextSnapshot.route,
        messageIndex: result.userMessageIndex,
        threadId,
      },
    );

    // Return the SSE stream
    return new NextResponse(persistentStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
        'X-Thread-Id': threadId,
        'X-User-Message-Id': result.userMessage.id,
        'X-Assistant-Message-Id': result.assistantMessage.id,
      },
    }) as NextResponse<unknown>;
  },
  { entitlement: 'ai_support', permission: 'ai_support.chat', writeAccess: true },
);
