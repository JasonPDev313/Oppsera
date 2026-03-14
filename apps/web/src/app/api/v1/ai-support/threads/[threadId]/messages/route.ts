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
  { permission: 'ai_support.chat' },
);

/**
 * Wraps the orchestrator SSE stream to capture all chunk text.
 * After the stream ends, persists the full assistant answer to DB,
 * replacing the "[streaming]" placeholder.
 */
function wrapStreamWithPersistence(
  stream: ReadableStream<Uint8Array>,
  assistantMessageId: string,
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
        if (collectedText) {
          try {
            await db
              .update(aiAssistantMessages)
              .set({ messageText: collectedText })
              .where(eq(aiAssistantMessages.id, assistantMessageId));
          } catch (err) {
            console.error('[ai-support] Failed to persist assistant message:', err);
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
  { permission: 'ai_support.chat', writeAccess: true },
);
