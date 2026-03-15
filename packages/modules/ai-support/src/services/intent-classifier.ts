import { eq, and } from 'drizzle-orm';
import { db, aiSupportConversationTags } from '@oppsera/db';

// ── Constants ────────────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 15_000;
const VALID_INTENTS = new Set(['how_to', 'troubleshoot', 'feature_request', 'complaint', 'general']);
const VALID_URGENCIES = new Set(['low', 'medium', 'high', 'critical']);

// ── Intent Classifier ─────────────────────────────────────────────────────────

/**
 * Classifies a support conversation using Claude Haiku and inserts topic/intent/urgency
 * tags into `ai_support_conversation_tags`. Idempotent — skips if tags already exist.
 *
 * Non-critical: never throws. Errors are logged only.
 */
export async function classifyConversation(
  threadId: string,
  tenantId: string,
  question: string,
  answer: string,
): Promise<void> {
  try {
    // 1. Idempotency check — skip if already classified (tenant-scoped)
    const existing = await db
      .select({ id: aiSupportConversationTags.id })
      .from(aiSupportConversationTags)
      .where(
        and(
          eq(aiSupportConversationTags.threadId, threadId),
          eq(aiSupportConversationTags.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      return;
    }

    // 2. Call Claude Haiku for classification
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('[ai-support/intent-classifier] ANTHROPIC_API_KEY not set — skipping classification');
      return;
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
        max_tokens: 128,
        system:
          'Classify this support conversation. Respond with ONLY a JSON object with these fields:\n' +
          '- topic: the main subject area (e.g., billing, inventory, pos, orders, catalog, settings, reporting, customers, spa, membership, accounting, onboarding, general)\n' +
          '- intent: one of: how_to, troubleshoot, feature_request, complaint, general\n' +
          '- urgency: one of: low, medium, high, critical',
        messages: [
          {
            role: 'user',
            content: `Question: ${question.slice(0, 2000)}\n\nAnswer: ${answer.slice(0, 2000)}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error('[ai-support/intent-classifier] Haiku API error', response.status, body);
      return;
    }

    const payload = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };

    const rawText = payload.content.find((c) => c.type === 'text')?.text ?? '';

    // 3. Parse the JSON response — strip possible markdown fences
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[ai-support/intent-classifier] No JSON found in Haiku response', rawText);
      return;
    }

    let parsed: { topic?: unknown; intent?: unknown; urgency?: unknown };
    try {
      parsed = JSON.parse(jsonMatch[0]) as { topic?: unknown; intent?: unknown; urgency?: unknown };
    } catch (parseErr) {
      console.error('[ai-support/intent-classifier] JSON parse error', parseErr, rawText);
      return;
    }

    // 4. Runtime validation of all three fields
    const topic = typeof parsed.topic === 'string' ? parsed.topic.slice(0, 64) : null;
    const intent = typeof parsed.intent === 'string' && VALID_INTENTS.has(parsed.intent)
      ? parsed.intent
      : null;
    const urgency = typeof parsed.urgency === 'string' && VALID_URGENCIES.has(parsed.urgency)
      ? parsed.urgency
      : null;

    if (!topic || !intent || !urgency) {
      console.error('[ai-support/intent-classifier] Incomplete or invalid classification', parsed);
      return;
    }

    // 5. Insert 3 tag rows
    await db.insert(aiSupportConversationTags).values([
      { threadId, tenantId, tagType: 'topic', tagValue: topic },
      { threadId, tenantId, tagType: 'intent', tagValue: intent },
      { threadId, tenantId, tagType: 'urgency', tagValue: urgency },
    ]);
  } catch (err) {
    console.error('[ai-support/intent-classifier]', err);
  }
}
