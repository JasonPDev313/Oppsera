import { eq, and, inArray, isNull, sql } from 'drizzle-orm';
import { db, aiSupportAnswerCards, aiAssistantAnswerMemory, tenantFeatureFlags } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { ConfidenceLevel, SourceTier } from '../constants';
import { embedAnswerCard } from './card-embeddings';

// ── Types ────────────────────────────────────────────────────────────

export interface AutoDraftInput {
  tenantId: string;
  question: string;
  answerText: string;
  confidence: ConfidenceLevel;
  sourceTier: SourceTier;
  moduleKey?: string | null;
  route?: string | null;
  /** If provided, skips drafting for follow-up messages (messageIndex > 0) */
  messageIndex?: number;
}

interface GradeResult {
  pass: boolean;
  reason?: string;
}

// ── Constants ────────────────────────────────────────────────────────

const ESCALATION_PHRASE = "I'd recommend reaching out to your system administrator";
const SAFETY_MODIFIED_MARKER = '[Response modified for safety]';
const MIN_ANSWER_LENGTH = 100;
const PASSABLE_TIERS: SourceTier[] = ['t1', 't2', 't3', 't4'];
const SIMILARITY_THRESHOLD = 0.5;
/** Max auto-drafts per tenant per day to prevent flood */
const MAX_DAILY_DRAFTS_PER_TENANT = 20;
/** Max slug generation retries on unique constraint collision */
const MAX_SLUG_RETRIES = 3;

// ── Self-Grading ─────────────────────────────────────────────────────

/**
 * Self-grade the AI answer to determine if it's worth saving as a draft card.
 *
 * Criteria:
 *  1. Confidence must be 'high'
 *  2. Source tier must be t1–t4 (real evidence, not just semantic/code)
 *  3. Answer must be substantive (>100 chars)
 *  4. No escalation phrase (the model admitted it couldn't help)
 *  5. No safety-modified response
 *  6. Must be the first user message in the thread (not a follow-up refinement)
 */
function gradeAnswer(input: AutoDraftInput): GradeResult {
  // Skip follow-up messages — only the initial question is worth drafting
  if (input.messageIndex != null && input.messageIndex > 0) {
    return { pass: false, reason: 'follow-up message' };
  }

  if (input.confidence !== 'high') {
    return { pass: false, reason: `confidence=${input.confidence}` };
  }

  if (!PASSABLE_TIERS.includes(input.sourceTier)) {
    return { pass: false, reason: `sourceTier=${input.sourceTier}` };
  }

  if (input.answerText.length < MIN_ANSWER_LENGTH) {
    return { pass: false, reason: 'answer too short' };
  }

  if (input.answerText.includes(ESCALATION_PHRASE)) {
    return { pass: false, reason: 'escalation detected' };
  }

  if (input.answerText.includes(SAFETY_MODIFIED_MARKER)) {
    return { pass: false, reason: 'safety modified' };
  }

  return { pass: true };
}

// ── Similarity Check ─────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'and', 'but', 'or',
  'nor', 'not', 'so', 'if', 'then', 'than', 'that', 'this', 'these',
  'those', 'it', 'its', 'my', 'your', 'his', 'her', 'our', 'their',
  'what', 'which', 'who', 'whom', 'how', 'when', 'where', 'why', 'i',
  'me', 'we', 'you', 'he', 'she', 'they', 'them', 'us',
]);

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Compute Jaccard similarity between two keyword sets.
 */
function keywordSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Check if a similar answer card OR answer memory entry already exists.
 * Checks both sources to avoid creating drafts for questions that
 * already have approved answers in memory (T3).
 *
 * Uses ILIKE pre-filtering on the top keywords to reduce the candidate
 * set before computing Jaccard similarity in memory. This keeps the
 * query fast even with thousands of cards.
 */
async function isTooSimilar(
  question: string,
  moduleKey: string | null | undefined,
): Promise<boolean> {
  const questionKeywords = extractKeywords(question);
  if (questionKeywords.length === 0) return false;

  // Use top 5 keywords for ILIKE pre-filter — matches any card containing
  // at least one of these keywords in its question pattern
  const topKeywords = questionKeywords.slice(0, 5);
  const cardIlike = topKeywords.map(
    (kw) => sql`${aiSupportAnswerCards.questionPattern} ILIKE ${'%' + kw + '%'}`,
  );
  const memoryIlike = topKeywords.map(
    (kw) => sql`${aiAssistantAnswerMemory.questionNormalized} ILIKE ${'%' + kw + '%'}`,
  );

  // ── Check 1: Existing answer cards (pre-filtered by keyword overlap) ──
  const cardConditions = [
    inArray(aiSupportAnswerCards.status, ['draft', 'active', 'stale']),
    sql`(${sql.join(cardIlike, sql` OR `)})`,
  ];
  if (moduleKey) {
    cardConditions.push(eq(aiSupportAnswerCards.moduleKey, moduleKey));
  }

  const existingCards = await db
    .select({ questionPattern: aiSupportAnswerCards.questionPattern })
    .from(aiSupportAnswerCards)
    .where(and(...cardConditions))
    .limit(50);

  for (const card of existingCards) {
    const cardKeywords = extractKeywords(card.questionPattern);
    if (keywordSimilarity(questionKeywords, cardKeywords) >= SIMILARITY_THRESHOLD) {
      return true;
    }
  }

  // ── Check 2: Answer memory (pre-filtered by keyword overlap) ──
  const memoryConditions = [
    eq(aiAssistantAnswerMemory.reviewStatus, 'approved'),
    sql`(${sql.join(memoryIlike, sql` OR `)})`,
  ];
  if (moduleKey) {
    memoryConditions.push(eq(aiAssistantAnswerMemory.moduleKey, moduleKey));
  }

  const memoryEntries = await db
    .select({ questionNormalized: aiAssistantAnswerMemory.questionNormalized })
    .from(aiAssistantAnswerMemory)
    .where(and(...memoryConditions))
    .limit(50);

  for (const entry of memoryEntries) {
    const memoryKeywords = extractKeywords(entry.questionNormalized);
    if (keywordSimilarity(questionKeywords, memoryKeywords) >= SIMILARITY_THRESHOLD) {
      return true;
    }
  }

  return false;
}

// ── Rate Limiting ────────────────────────────────────────────────────

/**
 * Check if the global auto-draft limit for today has been reached.
 *
 * Auto-draft cards are stored with tenantId: null (global knowledge base),
 * so the daily cap is intentionally global — not per-tenant. The tenantId
 * parameter is retained for call-site consistency but is not used in the
 * query; the filter on isNull(tenantId) ensures we only count auto-drafted
 * global cards and not any tenant-scoped cards.
 *
 * 20 auto-drafts/day is a conservative default to prevent runaway creation.
 */
async function isDailyLimitReached(_tenantId: string): Promise<boolean> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(aiSupportAnswerCards)
    .where(
      and(
        isNull(aiSupportAnswerCards.tenantId),
        eq(aiSupportAnswerCards.status, 'draft'),
        eq(aiSupportAnswerCards.ownerUserId, '__auto_draft__'),
        sql`${aiSupportAnswerCards.createdAt} >= ${todayStart.toISOString()}`,
      ),
    );

  return (result?.count ?? 0) >= MAX_DAILY_DRAFTS_PER_TENANT;
}

// ── Slug Generator ───────────────────────────────────────────────────

function generateSlug(question: string): string {
  const base = question
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)
    .replace(/-+$/, '');

  const suffix = generateUlid().slice(-6).toLowerCase();
  return `${base}-${suffix}`;
}

// ── Strip Followups ──────────────────────────────────────────────────

function stripFollowups(text: string): string {
  const lastSep = text.lastIndexOf('\n---');
  if (lastSep === -1) return text;

  const afterSep = text.slice(lastSep + 4);
  const hasBullets = afterSep.split('\n').some((l) => /^[-*]\s+/.test(l.trim()));
  return hasBullets ? text.slice(0, lastSep).trimEnd() : text;
}

// ── Main Entry Point ─────────────────────────────────────────────────

/**
 * Evaluate an AI assistant answer and, if it's high-quality and not
 * duplicative, automatically save it as a draft answer card.
 *
 * This runs after the stream completes and the message is persisted.
 * All DB operations are awaited to avoid zombie connections on Vercel.
 */
export async function maybeCreateDraftAnswerCard(
  input: AutoDraftInput,
): Promise<{ created: boolean; reason?: string; cardId?: string }> {
  try {
    // Step 0: Feature flag gate — short-circuits before any other DB queries
    const [flagRow] = await db
      .select({ isEnabled: tenantFeatureFlags.isEnabled })
      .from(tenantFeatureFlags)
      .where(
        and(
          eq(tenantFeatureFlags.tenantId, input.tenantId),
          eq(tenantFeatureFlags.flagKey, 'auto_draft_enabled'),
        ),
      )
      .limit(1);

    // Default: enabled (opt-out model). If the flag row exists and is false, skip.
    if (flagRow && !flagRow.isEnabled) {
      return { created: false, reason: 'feature disabled' };
    }

    // Step 1: Self-grade
    const grade = gradeAnswer(input);
    if (!grade.pass) {
      return { created: false, reason: grade.reason };
    }

    // Step 2: Daily rate limit
    const limited = await isDailyLimitReached(input.tenantId);
    if (limited) {
      return { created: false, reason: 'daily limit reached' };
    }

    // Step 3: Similarity check (cards + answer memory)
    const similar = await isTooSimilar(input.question, input.moduleKey);
    if (similar) {
      return { created: false, reason: 'similar card or memory exists' };
    }

    // Step 4: Create draft answer card (with slug collision retry)
    const cleanAnswer = stripFollowups(input.answerText);
    let lastErr: unknown = null;

    for (let attempt = 0; attempt < MAX_SLUG_RETRIES; attempt++) {
      try {
        const slug = generateSlug(input.question);
        const [card] = await db
          .insert(aiSupportAnswerCards)
          .values({
            tenantId: null, // Global — admin can scope later
            slug,
            moduleKey: input.moduleKey ?? null,
            route: input.route ?? null,
            questionPattern: input.question.slice(0, 500),
            approvedAnswerMarkdown: cleanAnswer,
            version: 1,
            status: 'draft',
            ownerUserId: '__auto_draft__', // Sentinel — identifies AI-generated drafts
          })
          .returning({ id: aiSupportAnswerCards.id });

        console.log(
          `[ai-support/auto-draft] Created draft card ${card!.id} for: "${input.question.slice(0, 80)}..."`,
        );

        // Pre-generate embedding so it's ready when the card is activated
        await embedAnswerCard(card!.id).catch((e: unknown) => {
          console.error('[auto-draft] Embedding failed:', e instanceof Error ? e.message : e);
        });

        return { created: true, cardId: card!.id };
      } catch (err) {
        lastErr = err;
        // If it's a unique constraint violation on slug, retry with a new slug
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('uq_ai_answer_cards_slug') || msg.includes('unique constraint')) {
          continue;
        }
        // Non-slug error — break out
        break;
      }
    }

    console.error(
      '[ai-support/auto-draft] Failed after retries:',
      lastErr instanceof Error ? lastErr.message : lastErr,
    );
    return { created: false, reason: 'error' };
  } catch (err) {
    console.error(
      '[ai-support/auto-draft] Unexpected error:',
      err instanceof Error ? err.message : err,
    );
    return { created: false, reason: 'error' };
  }
}
