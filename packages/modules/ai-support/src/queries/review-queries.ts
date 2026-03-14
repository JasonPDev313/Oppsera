import { eq, and, desc, or } from 'drizzle-orm';
import { db, aiAssistantMessages, aiAssistantFeedback, aiAssistantReviews, aiSupportAnswerCards, aiAssistantAnswerMemory } from '@oppsera/db';

// ── Types ────────────────────────────────────────────────────────────

export interface ReviewQueueFilters {
  tenantId?: string;
  /** If true, only show messages with thumbs-down feedback */
  thumbsDownOnly?: boolean;
  /** If true, only show low-confidence messages */
  lowConfidenceOnly?: boolean;
  limit?: number;
}

export interface ReviewQueueItem {
  messageId: string;
  threadId: string;
  tenantId: string;
  messageText: string;
  answerConfidence: string | null;
  sourceTierUsed: string | null;
  createdAt: Date;
  feedbackRating: string | null;
  feedbackComment: string | null;
  reviewStatus: string | null;
  correctedAnswer: string | null;
}

export interface AnswerCardFilters {
  status?: 'draft' | 'active' | 'stale' | 'archived';
  moduleKey?: string;
  limit?: number;
}

export interface AnswerMemoryFilters {
  tenantId?: string;
  moduleKey?: string;
  reviewStatus?: 'pending' | 'approved' | 'rejected';
  limit?: number;
}

// ── List Review Queue ────────────────────────────────────────────────

export async function listReviewQueue(
  tenantId?: string,
  filters: ReviewQueueFilters = {},
): Promise<ReviewQueueItem[]> {
  const limit = Math.min(filters.limit ?? 50, 200);

  // Fetch assistant messages that are candidates for review:
  // low confidence OR thumbs-down OR never reviewed
  const messageRows = await db
    .select({
      id: aiAssistantMessages.id,
      tenantId: aiAssistantMessages.tenantId,
      threadId: aiAssistantMessages.threadId,
      messageText: aiAssistantMessages.messageText,
      answerConfidence: aiAssistantMessages.answerConfidence,
      sourceTierUsed: aiAssistantMessages.sourceTierUsed,
      feedbackStatus: aiAssistantMessages.feedbackStatus,
      createdAt: aiAssistantMessages.createdAt,
    })
    .from(aiAssistantMessages)
    .where(
      and(
        eq(aiAssistantMessages.role, 'assistant'),
        tenantId ? eq(aiAssistantMessages.tenantId, tenantId) : undefined,
        // Include messages that are low confidence OR thumbs-down
        or(
          eq(aiAssistantMessages.answerConfidence, 'low'),
          eq(aiAssistantMessages.feedbackStatus, 'down'),
        ),
      ),
    )
    .orderBy(desc(aiAssistantMessages.createdAt))
    .limit(limit);

  if (messageRows.length === 0) return [];

  const messageIds = messageRows.map((r) => r.id);

  // Load feedback for these messages
  const feedbackRows = await db
    .select({
      messageId: aiAssistantFeedback.messageId,
      rating: aiAssistantFeedback.rating,
      freeformComment: aiAssistantFeedback.freeformComment,
    })
    .from(aiAssistantFeedback)
    .where(
      or(...messageIds.map((id) => eq(aiAssistantFeedback.messageId, id))),
    );

  // Load existing reviews for these messages
  const reviewRows = await db
    .select({
      messageId: aiAssistantReviews.messageId,
      reviewStatus: aiAssistantReviews.reviewStatus,
      correctedAnswer: aiAssistantReviews.correctedAnswer,
    })
    .from(aiAssistantReviews)
    .where(
      or(...messageIds.map((id) => eq(aiAssistantReviews.messageId, id))),
    )
    .orderBy(desc(aiAssistantReviews.createdAt));

  const feedbackByMessage = new Map(feedbackRows.map((f) => [f.messageId, f]));
  // Use most recent review per message
  const reviewByMessage = new Map<string, typeof reviewRows[0]>();
  for (const r of reviewRows) {
    if (!reviewByMessage.has(r.messageId)) {
      reviewByMessage.set(r.messageId, r);
    }
  }

  return messageRows.map((msg) => {
    const feedback = feedbackByMessage.get(msg.id);
    const review = reviewByMessage.get(msg.id);
    return {
      messageId: msg.id,
      threadId: msg.threadId,
      tenantId: msg.tenantId,
      messageText: msg.messageText,
      answerConfidence: msg.answerConfidence,
      sourceTierUsed: msg.sourceTierUsed,
      createdAt: msg.createdAt,
      feedbackRating: feedback?.rating ?? null,
      feedbackComment: feedback?.freeformComment ?? null,
      reviewStatus: review?.reviewStatus ?? null,
      correctedAnswer: review?.correctedAnswer ?? null,
    };
  });
}

// ── List Answer Cards ────────────────────────────────────────────────

export async function listAnswerCards(
  filters: AnswerCardFilters = {},
): Promise<(typeof aiSupportAnswerCards.$inferSelect)[]> {
  const limit = Math.min(filters.limit ?? 50, 200);

  const conditions = [];
  if (filters.status) conditions.push(eq(aiSupportAnswerCards.status, filters.status));
  if (filters.moduleKey) conditions.push(eq(aiSupportAnswerCards.moduleKey, filters.moduleKey));

  return db
    .select()
    .from(aiSupportAnswerCards)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(aiSupportAnswerCards.updatedAt))
    .limit(limit);
}

// ── Get Answer Card ──────────────────────────────────────────────────

export async function getAnswerCard(
  id: string,
): Promise<typeof aiSupportAnswerCards.$inferSelect | null> {
  const [card] = await db
    .select()
    .from(aiSupportAnswerCards)
    .where(eq(aiSupportAnswerCards.id, id))
    .limit(1);

  return card ?? null;
}

// ── List Answer Memory ───────────────────────────────────────────────

export async function listAnswerMemory(
  filters: AnswerMemoryFilters = {},
): Promise<(typeof aiAssistantAnswerMemory.$inferSelect)[]> {
  const limit = Math.min(filters.limit ?? 50, 200);

  const conditions = [];
  if (filters.tenantId) conditions.push(eq(aiAssistantAnswerMemory.tenantId, filters.tenantId));
  if (filters.moduleKey) conditions.push(eq(aiAssistantAnswerMemory.moduleKey, filters.moduleKey));
  if (filters.reviewStatus) conditions.push(eq(aiAssistantAnswerMemory.reviewStatus, filters.reviewStatus));

  return db
    .select()
    .from(aiAssistantAnswerMemory)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(aiAssistantAnswerMemory.updatedAt))
    .limit(limit);
}
