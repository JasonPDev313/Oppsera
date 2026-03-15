import { eq, and } from 'drizzle-orm';
import { db, aiSupportCsatPredictions, aiAssistantMessages } from '@oppsera/db';

import { FAST_MODEL_ID } from '../constants';

const MODEL_ID = FAST_MODEL_ID;
/** Max time to wait for the Anthropic API before aborting */
const FETCH_TIMEOUT_MS = 15_000;
/** Max characters of conversation transcript to send to the LLM */
const MAX_TRANSCRIPT_CHARS = 40_000;

interface CsatResult {
  score: number;
  reasoning: string;
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>;
}

/**
 * Predicts a CSAT score (1-5) for a completed support thread using Claude Haiku.
 *
 * Returns null if:
 *  - A prediction already exists for this thread (idempotent)
 *  - The thread has fewer than 2 messages (insufficient signal)
 *  - The Anthropic API call or JSON parse fails
 */
export async function predictCSAT(
  threadId: string,
  tenantId: string,
): Promise<CsatResult | null> {
  try {
    // 1. Check if prediction already exists — idempotent guard (tenant-scoped)
    const existing = await db
      .select({ id: aiSupportCsatPredictions.id })
      .from(aiSupportCsatPredictions)
      .where(
        and(
          eq(aiSupportCsatPredictions.threadId, threadId),
          eq(aiSupportCsatPredictions.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      return null;
    }

    // 2. Load all messages for the thread ordered by creation time (tenant-scoped)
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
      .orderBy(aiAssistantMessages.createdAt);

    // 3. Need at least 2 messages (one user, one assistant) for meaningful signal
    if (messages.length < 2) {
      return null;
    }

    // 4. Format conversation for the LLM (with length cap)
    const conversationText = messages
      .map((msg) => {
        const label = msg.role === 'user' ? 'User' : 'Assistant';
        return `${label}: ${msg.messageText}`;
      })
      .join('\n')
      .slice(0, MAX_TRANSCRIPT_CHARS);

    // 5. Call Claude Haiku via direct fetch (non-streaming)
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('[ai-support/csat] ANTHROPIC_API_KEY is not configured');
      return null;
    }

    const anthropicMessages: AnthropicMessage[] = [
      { role: 'user', content: conversationText },
    ];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL_ID,
        max_tokens: 200,
        system:
          'You are evaluating customer satisfaction for a support conversation. Based on the conversation below, predict a CSAT score from 1-5 (1=very dissatisfied, 5=very satisfied). Consider: was the question answered? Was the answer accurate? Was the tone appropriate? Did the user seem satisfied? Respond with ONLY a JSON object: {"score": N, "reasoning": "brief explanation"}',
        messages: anthropicMessages,
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[ai-support/csat] Anthropic API error:', response.status, errText);
      return null;
    }

    const data = (await response.json()) as AnthropicResponse;
    const rawText = data.content?.[0]?.text?.trim();

    if (!rawText) {
      console.error('[ai-support/csat] Empty response from Anthropic');
      return null;
    }

    // 5a. Parse and validate the JSON response
    let parsed: { score: unknown; reasoning: unknown };
    try {
      parsed = JSON.parse(rawText) as { score: unknown; reasoning: unknown };
    } catch (parseErr) {
      console.error('[ai-support/csat] Failed to parse JSON from Anthropic response:', rawText, parseErr);
      return null;
    }

    const score = Number(parsed.score);
    const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning.slice(0, 1000) : '';

    if (!Number.isInteger(score) || score < 1 || score > 5) {
      console.error('[ai-support/csat] Invalid score from Anthropic:', parsed.score);
      return null;
    }

    // 6. Persist prediction
    await db.insert(aiSupportCsatPredictions).values({
      threadId,
      tenantId,
      score,
      reasoning,
      modelUsed: MODEL_ID,
    });

    // 7. Return result
    return { score, reasoning };
  } catch (err) {
    console.error('[ai-support/csat] predictCSAT failed:', err);
    return null;
  }
}
