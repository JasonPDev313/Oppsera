import type { SentimentValue } from '../types';
import { db, aiAssistantMessages } from '@oppsera/db';
import { eq, and, desc, isNotNull } from 'drizzle-orm';

const VALID_SENTIMENTS: readonly SentimentValue[] = ['positive', 'neutral', 'frustrated', 'angry'];
const FETCH_TIMEOUT_MS = 10_000;

/**
 * Calls Claude Haiku to classify the sentiment of a user message.
 * Non-critical — returns null on any error.
 */
export async function analyzeSentiment(
  messageText: string,
): Promise<{ sentiment: SentimentValue; confidence: number } | null> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('[ai-support/sentiment] ANTHROPIC_API_KEY not set');
      return null;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 64,
        system:
          'Classify the sentiment of this user message as one of: positive, neutral, frustrated, angry. Respond with ONLY a JSON object: {"sentiment": "...", "confidence": 0.XX}',
        messages: [{ role: 'user', content: messageText.slice(0, 2000) }],
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error('[ai-support/sentiment] API error', response.status, await response.text());
      return null;
    }

    const body = await response.json() as {
      content?: Array<{ type: string; text: string }>;
    };

    const textBlock = body.content?.find((c) => c.type === 'text');
    if (!textBlock?.text) {
      console.error('[ai-support/sentiment] No text block in response');
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(textBlock.text.trim());
    } catch {
      console.error('[ai-support/sentiment] Failed to parse JSON from response:', textBlock.text);
      return null;
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('sentiment' in parsed) ||
      !('confidence' in parsed)
    ) {
      console.error('[ai-support/sentiment] Unexpected response shape:', parsed);
      return null;
    }

    const { sentiment, confidence } = parsed as { sentiment: unknown; confidence: unknown };

    if (
      typeof sentiment !== 'string' ||
      !VALID_SENTIMENTS.includes(sentiment as SentimentValue)
    ) {
      console.error('[ai-support/sentiment] Invalid sentiment value:', sentiment);
      return null;
    }

    if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
      console.error('[ai-support/sentiment] Invalid confidence value:', confidence);
      return null;
    }

    return { sentiment: sentiment as SentimentValue, confidence };
  } catch (err) {
    console.error('[ai-support/sentiment] Unexpected error in analyzeSentiment:', err);
    return null;
  }
}

/**
 * Returns true if the last 2 user messages in the thread both have
 * a negative sentiment ('frustrated' or 'angry').
 * Non-critical — returns false on any error.
 */
export async function checkConsecutiveNegative(
  threadId: string,
  tenantId: string,
): Promise<boolean> {
  try {
    const rows = await db
      .select({ sentiment: aiAssistantMessages.sentiment })
      .from(aiAssistantMessages)
      .where(
        and(
          eq(aiAssistantMessages.threadId, threadId),
          eq(aiAssistantMessages.tenantId, tenantId),
          eq(aiAssistantMessages.role, 'user'),
          isNotNull(aiAssistantMessages.sentiment),
        ),
      )
      .orderBy(desc(aiAssistantMessages.createdAt))
      .limit(2);

    if (rows.length < 2) return false;

    const negativeSet = new Set<string>(['frustrated', 'angry']);
    return rows.every((r) => r.sentiment !== null && negativeSet.has(r.sentiment));
  } catch (err) {
    console.error('[ai-support/sentiment] Unexpected error in checkConsecutiveNegative:', err);
    return false;
  }
}
