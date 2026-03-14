import { eq, and } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { auditLog } from '@oppsera/core/audit/helpers';
import { AppError, NotFoundError, generateUlid } from '@oppsera/shared';
import {
  db,
  aiAssistantReviews,
  aiAssistantMessages,
  aiSupportAnswerCards,
  aiAssistantAnswerMemory,
} from '@oppsera/db';

// ── Types ────────────────────────────────────────────────────────────

export type ReviewStatus = 'approved' | 'edited' | 'rejected' | 'needs_kb_update';

export interface SubmitReviewInput {
  messageId: string;
  threadId: string;
  tenantId?: string | null;
  reviewStatus: ReviewStatus;
  reviewNotes?: string | null;
  correctedAnswer?: string | null;
  /** Required when status is 'approved' or 'edited' — used to populate answer memory */
  questionNormalized?: string | null;
  screenKey?: string | null;
  moduleKey?: string | null;
}

export interface CreateAnswerCardInput {
  tenantId?: string | null;
  slug: string;
  moduleKey?: string | null;
  route?: string | null;
  questionPattern: string;
  approvedAnswerMarkdown: string;
  status?: 'draft' | 'active' | 'stale' | 'archived';
  ownerUserId?: string | null;
}

export interface UpdateAnswerCardInput {
  slug?: string;
  moduleKey?: string | null;
  route?: string | null;
  questionPattern?: string;
  approvedAnswerMarkdown?: string;
  status?: 'draft' | 'active' | 'stale' | 'archived';
  ownerUserId?: string | null;
}

// ── Submit Review ────────────────────────────────────────────────────

export async function submitReview(
  ctx: RequestContext,
  input: SubmitReviewInput,
): Promise<typeof aiAssistantReviews.$inferSelect> {
  // Verify message exists and belongs to this tenant
  const [message] = await db
    .select()
    .from(aiAssistantMessages)
    .where(
      and(
        eq(aiAssistantMessages.id, input.messageId),
        eq(aiAssistantMessages.tenantId, input.tenantId ?? ctx.tenantId),
      ),
    )
    .limit(1);

  if (!message) {
    throw new NotFoundError('Message', input.messageId);
  }

  if (message.role !== 'assistant') {
    throw new AppError('INVALID_MESSAGE_ROLE', 'Only assistant messages can be reviewed', 400);
  }

  // Derive threadId from the message — never trust caller-supplied threadId
  const derivedThreadId = message.threadId;

  // Insert review record
  const [review] = await db
    .insert(aiAssistantReviews)
    .values({
      tenantId: input.tenantId ?? message.tenantId,
      threadId: derivedThreadId,
      messageId: input.messageId,
      reviewerUserId: ctx.user.id,
      reviewStatus: input.reviewStatus,
      reviewNotes: input.reviewNotes ?? null,
      correctedAnswer: input.correctedAnswer ?? null,
    })
    .returning();

  // Status-specific side effects
  if (input.reviewStatus === 'approved') {
    // Promote original answer to memory
    const answerText = message.messageText;
    if (input.questionNormalized && answerText) {
      await _upsertAnswerMemory({
        tenantId: input.tenantId ?? message.tenantId,
        questionNormalized: input.questionNormalized,
        screenKey: input.screenKey ?? null,
        moduleKey: input.moduleKey ?? null,
        answerMarkdown: answerText,
        sourceTierUsed: message.sourceTierUsed ?? null,
        reviewStatus: 'approved',
        approvedBy: ctx.user.id,
      });
    }
  } else if (input.reviewStatus === 'edited') {
    const corrected = input.correctedAnswer;
    if (!corrected) {
      throw new AppError('CORRECTED_ANSWER_REQUIRED', 'correctedAnswer is required for edited status', 400);
    }
    // Promote corrected answer to memory
    if (input.questionNormalized) {
      await _upsertAnswerMemory({
        tenantId: input.tenantId ?? message.tenantId,
        questionNormalized: input.questionNormalized,
        screenKey: input.screenKey ?? null,
        moduleKey: input.moduleKey ?? null,
        answerMarkdown: corrected,
        sourceTierUsed: 'answer_card',
        reviewStatus: 'approved',
        approvedBy: ctx.user.id,
      });
    }
  } else if (input.reviewStatus === 'rejected') {
    // Mark any existing memory entry for this message as rejected
    // (no-op if none exists; answer memory is keyed by question not message)
  }

  await auditLog(
    ctx,
    `ai_support.review.${input.reviewStatus}`,
    'ai_assistant_review',
    review!.id,
  ).catch((e: unknown) => {
    console.error('Audit log failed for ai_support.review:', e instanceof Error ? e.message : e);
  });

  return review!;
}

// ── Create Answer Card ───────────────────────────────────────────────

export async function createAnswerCard(
  ctx: RequestContext,
  input: CreateAnswerCardInput,
): Promise<typeof aiSupportAnswerCards.$inferSelect> {
  const [card] = await db
    .insert(aiSupportAnswerCards)
    .values({
      tenantId: input.tenantId ?? null,
      slug: input.slug,
      moduleKey: input.moduleKey ?? null,
      route: input.route ?? null,
      questionPattern: input.questionPattern,
      approvedAnswerMarkdown: input.approvedAnswerMarkdown,
      version: 1,
      status: input.status ?? 'draft',
      ownerUserId: input.ownerUserId ?? ctx.user.id,
    })
    .returning();

  await auditLog(ctx, 'ai_support.answer_card.created', 'ai_support_answer_card', card!.id).catch(
    (e: unknown) => {
      console.error('Audit log failed for ai_support.answer_card.created:', e instanceof Error ? e.message : e);
    },
  );

  return card!;
}

// ── Update Answer Card ───────────────────────────────────────────────

export async function updateAnswerCard(
  ctx: RequestContext,
  id: string,
  input: UpdateAnswerCardInput,
): Promise<typeof aiSupportAnswerCards.$inferSelect> {
  const [existing] = await db
    .select()
    .from(aiSupportAnswerCards)
    .where(eq(aiSupportAnswerCards.id, id))
    .limit(1);

  if (!existing) {
    throw new NotFoundError('AnswerCard', id);
  }

  const updates: Partial<typeof aiSupportAnswerCards.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.slug !== undefined) {
    // Check for slug conflict with other cards
    const [conflict] = await db
      .select({ id: aiSupportAnswerCards.id })
      .from(aiSupportAnswerCards)
      .where(
        and(
          eq(aiSupportAnswerCards.slug, input.slug),
        ),
      )
      .limit(1);

    if (conflict && conflict.id !== id) {
      throw new AppError('SLUG_CONFLICT', `An answer card with slug "${input.slug}" already exists`, 409);
    }
    updates.slug = input.slug;
  }
  if (input.moduleKey !== undefined) updates.moduleKey = input.moduleKey;
  if (input.route !== undefined) updates.route = input.route;
  if (input.questionPattern !== undefined) updates.questionPattern = input.questionPattern;
  if (input.ownerUserId !== undefined) updates.ownerUserId = input.ownerUserId;
  if (input.status !== undefined) updates.status = input.status;

  // If answer content changes, bump version
  if (
    input.approvedAnswerMarkdown !== undefined &&
    input.approvedAnswerMarkdown !== existing.approvedAnswerMarkdown
  ) {
    updates.approvedAnswerMarkdown = input.approvedAnswerMarkdown;
    updates.version = existing.version + 1;
  }

  const [updated] = await db
    .update(aiSupportAnswerCards)
    .set(updates)
    .where(eq(aiSupportAnswerCards.id, id))
    .returning();

  await auditLog(ctx, 'ai_support.answer_card.updated', 'ai_support_answer_card', id).catch(
    (e: unknown) => {
      console.error('Audit log failed for ai_support.answer_card.updated:', e instanceof Error ? e.message : e);
    },
  );

  return updated!;
}

// ── Internal helper ──────────────────────────────────────────────────

interface UpsertAnswerMemoryInput {
  tenantId: string;
  questionNormalized: string;
  screenKey: string | null;
  moduleKey: string | null;
  answerMarkdown: string;
  sourceTierUsed: string | null;
  reviewStatus: string;
  approvedBy: string;
}

async function _upsertAnswerMemory(input: UpsertAnswerMemoryInput): Promise<void> {
  // Check for existing approved entry for this question + tenant scope
  const [existing] = await db
    .select({ id: aiAssistantAnswerMemory.id })
    .from(aiAssistantAnswerMemory)
    .where(
      and(
        eq(aiAssistantAnswerMemory.questionNormalized, input.questionNormalized),
        eq(aiAssistantAnswerMemory.tenantId, input.tenantId),
      ),
    )
    .limit(1);

  if (existing) {
    // Update existing entry
    await db
      .update(aiAssistantAnswerMemory)
      .set({
        answerMarkdown: input.answerMarkdown,
        screenKey: input.screenKey,
        moduleKey: input.moduleKey,
        sourceTierUsed: input.sourceTierUsed,
        reviewStatus: input.reviewStatus,
        approvedBy: input.approvedBy,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(aiAssistantAnswerMemory.id, existing.id));
  } else {
    // Insert new memory entry
    await db.insert(aiAssistantAnswerMemory).values({
      id: generateUlid(),
      tenantId: input.tenantId,
      questionNormalized: input.questionNormalized,
      screenKey: input.screenKey,
      moduleKey: input.moduleKey,
      tenantScope: 'global',
      answerMarkdown: input.answerMarkdown,
      sourceTierUsed: input.sourceTierUsed,
      reviewStatus: input.reviewStatus,
      approvedBy: input.approvedBy,
      approvedAt: new Date(),
    });
  }
}
