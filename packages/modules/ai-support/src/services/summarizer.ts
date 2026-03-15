import { db, aiAssistantMessages, aiAssistantThreads } from '@oppsera/db';
import { eq, and, asc } from 'drizzle-orm';
import { FAST_MODEL_ID } from '../constants';

// ── Types ────────────────────────────────────────────────────────────

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>;
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Format messages into a simple "User: ..." / "Assistant: ..." transcript
 * for the summarization prompt.
 */
function formatTranscript(
  messages: Array<{ role: string; messageText: string }>,
): string {
  return messages
    .map((m) => {
      const label = m.role === 'user' ? 'User' : 'Assistant';
      return `${label}: ${m.messageText.trim()}`;
    })
    .join('\n');
}

/**
 * Call Claude Haiku (non-streaming) to produce a 2–3 sentence summary.
 * Returns the summary string, or null on any error.
 */
async function callHaikuSummarize(transcript: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[ai-support/summarizer] ANTHROPIC_API_KEY is not set');
    return null;
  }

  const userMessage: AnthropicMessage = {
    role: 'user',
    content: `Summarize this conversation in 2-3 sentences. Focus on what the user asked and whether it was resolved.\n\n${transcript.slice(0, 40_000)}`,
  };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: FAST_MODEL_ID,
      max_tokens: 256,
      messages: [userMessage],
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '<unreadable>');
    console.error(
      '[ai-support/summarizer] Anthropic API error:',
      response.status,
      errorText,
    );
    return null;
  }

  const data = (await response.json()) as AnthropicResponse;
  const textBlock = data.content?.find((c) => c.type === 'text');
  return textBlock?.text?.trim() ?? null;
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Summarize a thread using Claude Haiku.
 *
 * - Returns null if there are fewer than 4 messages (not enough to summarize).
 * - Skips summarization if an existing summary is present and the message count
 *   hasn't grown by 2+ (avoids redundant LLM calls).
 * - Persists the new summary to `ai_assistant_threads.summary`.
 * - Never throws — all errors are logged and null is returned.
 */
export async function summarizeThread(
  threadId: string,
  tenantId: string,
): Promise<string | null> {
  try {
    // 1. Load all messages for this thread, oldest-first
    const messages = await db
      .select({
        role: aiAssistantMessages.role,
        messageText: aiAssistantMessages.messageText,
      })
      .from(aiAssistantMessages)
      .where(
        and(
          eq(aiAssistantMessages.threadId, threadId),
          eq(aiAssistantMessages.tenantId, tenantId),
        ),
      )
      .orderBy(asc(aiAssistantMessages.createdAt));

    // 2. Minimum message threshold
    if (messages.length < 4) {
      return null;
    }

    // 3. Check for an existing summary on the thread
    const threadRows = await db
      .select({ summary: aiAssistantThreads.summary })
      .from(aiAssistantThreads)
      .where(
        and(
          eq(aiAssistantThreads.id, threadId),
          eq(aiAssistantThreads.tenantId, tenantId),
        ),
      )
      .limit(1);

    const existingSummary = threadRows[0]?.summary ?? null;

    if (existingSummary) {
      // Re-summarize at every threshold: 4, 8, 12, 16, … messages.
      // If message count is not a multiple of 4 we skip re-summarization.
      if (messages.length % 4 !== 0) {
        return existingSummary;
      }
    }

    // 4. Format transcript and call Haiku
    const transcript = formatTranscript(messages);
    const summary = await callHaikuSummarize(transcript);

    if (!summary) {
      // Haiku call failed — return existing summary if available
      return existingSummary;
    }

    // 5. Persist the new summary back to the thread row
    await db
      .update(aiAssistantThreads)
      .set({ summary, updatedAt: new Date() })
      .where(
        and(
          eq(aiAssistantThreads.id, threadId),
          eq(aiAssistantThreads.tenantId, tenantId),
        ),
      );

    return summary;
  } catch (err) {
    console.error('[ai-support/summarizer] summarizeThread error:', err);
    return null;
  }
}
