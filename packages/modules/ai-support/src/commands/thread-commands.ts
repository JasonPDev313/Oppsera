import { eq, and, asc, sql, lt } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { auditLog } from '@oppsera/core/audit/helpers';
import { AppError, NotFoundError } from '@oppsera/shared';
import {
  db,
  aiAssistantThreads,
  aiAssistantMessages,
  aiAssistantContextSnapshots,
} from '@oppsera/db';
import type {
  CreateThreadInput,
  UpdateThreadInput,
  AiAssistantContext,
  SourceTier,
  ConfidenceLevel,
} from '../types';
import { runOrchestratorCollected } from '../services/orchestrator';
import { MAX_MESSAGES_PER_THREAD, MAX_CONCURRENT_THREADS_PER_USER, MAX_MESSAGE_LENGTH } from '../constants';
import { checkRateLimit } from '../services/rate-limiter';
// ── Mode resolution ─────────────────────────────────────────────────

/**
 * Determine whether the AI assistant should operate in staff or customer mode.
 *
 * Staff mode: shows code references, API routes, internal details.
 * Customer mode: strips code blocks, internal URLs, technical patterns.
 *
 * Currently all authenticated users are tenant staff, so this always returns
 * 'staff'. When a customer-facing portal is added, extend this to check
 * the user's auth source or role to return 'customer' for external users.
 */
function resolveAssistantMode(_ctx: RequestContext): 'staff' | 'customer' {
  // All users going through withMiddleware are authenticated tenant staff.
  // Future: check ctx auth source or external-customer flag here.
  return 'staff';
}

// ── Create Thread ───────────────────────────────────────────────────

export async function createThread(
  ctx: RequestContext,
  input: CreateThreadInput,
): Promise<typeof aiAssistantThreads.$inferSelect> {
  // Guard: max concurrent open threads per user
  const openThreads = await db
    .select({ id: aiAssistantThreads.id })
    .from(aiAssistantThreads)
    .where(
      and(
        eq(aiAssistantThreads.tenantId, ctx.tenantId),
        eq(aiAssistantThreads.userId, ctx.user.id),
        eq(aiAssistantThreads.status, 'open'),
      ),
    );

  if (openThreads.length >= MAX_CONCURRENT_THREADS_PER_USER) {
    throw new AppError(
      'MAX_OPEN_THREADS',
      `You can have at most ${MAX_CONCURRENT_THREADS_PER_USER} open threads. Please close an existing thread first.`,
      409,
    );
  }

  const [thread] = await db
    .insert(aiAssistantThreads)
    .values({
      tenantId: ctx.tenantId,
      userId: ctx.user.id,
      channel: input.channel ?? 'in_app',
      currentRoute: input.currentRoute,
      moduleKey: input.moduleKey ?? null,
      status: 'open',
    })
    .returning();

  await auditLog(ctx, 'ai_support.thread.created', 'ai_assistant_thread', thread!.id).catch(
    (e: unknown) => {
      console.error('Audit log failed for ai_support.thread.created:', e instanceof Error ? e.message : e);
    },
  );

  return thread!;
}

// ── Close Thread ────────────────────────────────────────────────────

export async function closeThread(
  ctx: RequestContext,
  threadId: string,
  updates?: UpdateThreadInput,
): Promise<typeof aiAssistantThreads.$inferSelect> {
  const newStatus = updates?.status ?? 'closed';

  // Use a transaction with row lock for reopens to prevent concurrent reopens
  // from exceeding the MAX_CONCURRENT_THREADS_PER_USER limit.
  const updated = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(aiAssistantThreads)
      .where(
        and(
          eq(aiAssistantThreads.id, threadId),
          eq(aiAssistantThreads.tenantId, ctx.tenantId),
          eq(aiAssistantThreads.userId, ctx.user.id),
        ),
      )
      .for('update');

    if (!existing) {
      throw new NotFoundError('Thread', threadId);
    }

    const isReopening = newStatus === 'open' && existing.status !== 'open';

    // Only allow reopening closed threads — flagged/reviewed threads
    // are in admin review and should not be user-reopenable.
    if (isReopening && existing.status !== 'closed') {
      throw new AppError(
        'THREAD_NOT_REOPENABLE',
        'This conversation cannot be resumed because it is under review.',
        409,
      );
    }

    // When reopening, check the concurrent open-thread limit inside the lock
    if (isReopening) {
      const [countResult] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(aiAssistantThreads)
        .where(
          and(
            eq(aiAssistantThreads.tenantId, ctx.tenantId),
            eq(aiAssistantThreads.userId, ctx.user.id),
            eq(aiAssistantThreads.status, 'open'),
          ),
        );

      if ((countResult?.count ?? 0) >= MAX_CONCURRENT_THREADS_PER_USER) {
        throw new AppError(
          'MAX_OPEN_THREADS',
          `You can have at most ${MAX_CONCURRENT_THREADS_PER_USER} open threads. Please close an existing thread first.`,
          409,
        );
      }
    }

    const [row] = await tx
      .update(aiAssistantThreads)
      .set({
        status: newStatus,
        questionType: updates?.questionType ?? existing.questionType,
        outcome: updates?.outcome ?? existing.outcome,
        issueTag: updates?.issueTag ?? existing.issueTag,
        endedAt: isReopening ? null : new Date(),
        updatedAt: new Date(),
      })
      .where(eq(aiAssistantThreads.id, threadId))
      .returning();

    return row!;
  });

  const isReopened = newStatus === 'open';
  const auditAction = isReopened ? 'ai_support.thread.reopened' : 'ai_support.thread.closed';
  await auditLog(ctx, auditAction, 'ai_assistant_thread', threadId).catch(
    (e: unknown) => {
      console.error(`Audit log failed for ${auditAction}:`, e instanceof Error ? e.message : e);
    },
  );

  return updated;
}

// ── Send Message ────────────────────────────────────────────────────

interface SendMessageResult {
  userMessage: typeof aiAssistantMessages.$inferSelect;
  assistantMessage: typeof aiAssistantMessages.$inferSelect;
  confidence: ConfidenceLevel;
  sourceTierUsed: SourceTier;
  sources: string[];
  stream: ReadableStream<Uint8Array>;
  /** 0-based index of this user message in the thread (0 = first question) */
  userMessageIndex: number;
}

export async function sendMessage(
  ctx: RequestContext,
  threadId: string,
  messageText: string,
  contextSnapshot: AiAssistantContext,
): Promise<SendMessageResult> {
  // Guard: check message length before any DB operations
  if (messageText.length > MAX_MESSAGE_LENGTH) {
    throw new AppError(
      'MESSAGE_TOO_LONG',
      `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters.`,
      400,
    );
  }

  // Verify thread exists and belongs to this tenant + user
  const [thread] = await db
    .select()
    .from(aiAssistantThreads)
    .where(
      and(
        eq(aiAssistantThreads.id, threadId),
        eq(aiAssistantThreads.tenantId, ctx.tenantId),
        eq(aiAssistantThreads.userId, ctx.user.id),
      ),
    )
    .limit(1);

  if (!thread) {
    throw new NotFoundError('Thread', threadId);
  }

  if (thread.status !== 'open') {
    throw new AppError('THREAD_CLOSED', 'Cannot send messages to a closed thread', 409);
  }

  // Finding 21: enforce hourly message rate limit
  const hourlyLimit = await checkRateLimit(ctx.tenantId, ctx.user.id, 'messages_per_hour');
  if (!hourlyLimit.allowed) {
    throw new AppError(
      'RATE_LIMIT',
      `Rate limit exceeded. You can send up to ${hourlyLimit.limit} messages per hour.`,
      429,
    );
  }

  // Finding 22: atomic message count check + insert inside a transaction with a row lock
  // so concurrent requests cannot race past the MAX_MESSAGES_PER_THREAD guard.
  const { userMessage, userMessageIndex } = await db.transaction(async (tx) => {
    // Lock the thread row to serialise concurrent sendMessage calls for the same thread
    const [lockedThread] = await tx
      .select()
      .from(aiAssistantThreads)
      .where(
        and(
          eq(aiAssistantThreads.id, threadId),
          eq(aiAssistantThreads.tenantId, ctx.tenantId),
        ),
      )
      .for('update');

    if (!lockedThread) throw new NotFoundError('Thread', threadId);
    if (lockedThread.status !== 'open') {
      throw new AppError('THREAD_CLOSED', 'Cannot send messages to a closed thread', 409);
    }

    // Count messages inside the lock
    const [countResult] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(aiAssistantMessages)
      .where(
        and(
          eq(aiAssistantMessages.threadId, threadId),
          eq(aiAssistantMessages.tenantId, ctx.tenantId),
        ),
      );

    const msgCount = countResult?.count ?? 0;

    // 0 = first question, 1 = second question, etc. (each turn = 2 messages: user + assistant)
    const msgIndex = Math.floor(msgCount / 2);

    if (msgCount >= MAX_MESSAGES_PER_THREAD) {
      throw new AppError(
        'MAX_MESSAGES_REACHED',
        `Thread has reached the maximum of ${MAX_MESSAGES_PER_THREAD} messages. Please start a new thread.`,
        409,
      );
    }

    // Insert user message inside the same transaction
    const [msg] = await tx
      .insert(aiAssistantMessages)
      .values({
        tenantId: ctx.tenantId,
        threadId,
        role: 'user',
        messageText,
      })
      .returning();

    return { userMessage: msg!, userMessageIndex: msgIndex };
  });

  // Save context snapshot
  await db.insert(aiAssistantContextSnapshots).values({
    tenantId: ctx.tenantId,
    threadId,
    messageId: userMessage.id,
    route: contextSnapshot.route,
    screenTitle: contextSnapshot.screenTitle ?? null,
    moduleKey: contextSnapshot.moduleKey ?? null,
    roleKeysJson: contextSnapshot.roleKeys,
    featureFlagsJson: contextSnapshot.featureFlags ?? null,
    enabledModulesJson: contextSnapshot.enabledModules ?? null,
    visibleActionsJson: contextSnapshot.visibleActions ?? null,
    selectedRecordJson: contextSnapshot.selectedRecord ?? null,
    uiStateJson: contextSnapshot.uiState ?? null,
    tenantSettingsJson: contextSnapshot.tenantSettings ?? null,
  });

  // Clean up stale [streaming] zombie messages (older than 2 minutes) in this thread.
  // These occur when the Vercel function is killed before flush() runs.
  const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000);
  await db
    .update(aiAssistantMessages)
    .set({ messageText: '[No response generated]' })
    .where(
      and(
        eq(aiAssistantMessages.threadId, threadId),
        eq(aiAssistantMessages.tenantId, ctx.tenantId),
        eq(aiAssistantMessages.messageText, '[streaming]'),
        lt(aiAssistantMessages.createdAt, twoMinAgo),
      ),
    )
    .catch((err: unknown) => {
      console.warn('[ai-support/thread-commands] Zombie cleanup failed:', err);
    });

  // Load thread history for context — collect all DB data BEFORE the LLM call
  // so we don't hold a DB connection during the potentially 60s orchestrator call.
  const historyRows = await db
    .select({
      role: aiAssistantMessages.role,
      messageText: aiAssistantMessages.messageText,
      answerConfidence: aiAssistantMessages.answerConfidence,
    })
    .from(aiAssistantMessages)
    .where(
      and(
        eq(aiAssistantMessages.threadId, threadId),
        eq(aiAssistantMessages.tenantId, ctx.tenantId),
      ),
    )
    .orderBy(asc(aiAssistantMessages.createdAt));

  // Exclude the just-inserted user message from history (it will be added by the orchestrator).
  // Filter out turns where the assistant response is still a placeholder (flush() DB update
  // may have failed silently). Remove BOTH the user question and assistant placeholder to
  // preserve strict user/assistant alternation required by the Anthropic API.
  const PLACEHOLDER_TEXTS = new Set(['[streaming]', '[No response generated]']);
  const rawHistory = historyRows
    .filter((r) => r.role === 'user' || r.role === 'assistant')
    .slice(0, -1); // Remove the last user message we just inserted

  const threadHistory: Array<{ role: string; content: string }> = [];
  for (let i = 0; i < rawHistory.length; i++) {
    const row = rawHistory[i]!;
    if (row.role === 'assistant' && PLACEHOLDER_TEXTS.has(row.messageText)) {
      // Drop this assistant placeholder AND the preceding user message (if any)
      if (threadHistory.length > 0 && threadHistory[threadHistory.length - 1]!.role === 'user') {
        threadHistory.pop();
      }
      continue;
    }
    threadHistory.push({ role: row.role, content: row.messageText });
  }

  // ── Sentiment analysis — run before orchestrator so we can adapt tone ──
  let userSentiment: 'positive' | 'neutral' | 'frustrated' | 'angry' | null = null;
  try {
    const { analyzeSentiment } = await import('../services/sentiment-analyzer');
    const sentimentResult = await analyzeSentiment(messageText);
    if (sentimentResult) {
      userSentiment = sentimentResult.sentiment;
      // Persist sentiment on the user message (non-blocking — OK if it fails)
      await db
        .update(aiAssistantMessages)
        .set({ sentiment: sentimentResult.sentiment })
        .where(eq(aiAssistantMessages.id, userMessage.id));
    }
  } catch (err) {
    console.warn('[ai-support/thread-commands] Sentiment analysis failed:', err);
  }

  // Extract the most recent assistant confidence for follow-up model routing
  const lastAssistant = [...historyRows].reverse().find((r) => r.role === 'assistant');
  const priorConfidence = lastAssistant?.answerConfidence as 'high' | 'medium' | 'low' | null ?? null;

  // ── LLM call — no DB connections held during this potentially long call ──
  const orchestratorResult = await runOrchestratorCollected({
    messageText,
    context: contextSnapshot,
    threadHistory,
    mode: resolveAssistantMode(ctx),
    userSentiment,
    priorConfidence,
  });

  // ── Post-LLM DB writes — acquire connection only after LLM completes ──
  // Insert a placeholder assistant message — the actual text arrives via the stream.
  // The API route will update this record after the stream completes.
  const [assistantMessage] = await db
    .insert(aiAssistantMessages)
    .values({
      tenantId: ctx.tenantId,
      threadId,
      role: 'assistant',
      messageText: '[streaming]', // Placeholder; updated after stream completes
      modelName: orchestratorResult.modelUsed,
      promptVersion: 'v1',
      answerConfidence: orchestratorResult.confidence,
      sourceTierUsed: orchestratorResult.sourceTierUsed,
      citationsJson: orchestratorResult.sources,
    })
    .returning();

  // Update thread's updatedAt
  await db
    .update(aiAssistantThreads)
    .set({ updatedAt: new Date() })
    .where(eq(aiAssistantThreads.id, threadId));

  return {
    userMessage,
    assistantMessage: assistantMessage!,
    confidence: orchestratorResult.confidence,
    sourceTierUsed: orchestratorResult.sourceTierUsed,
    sources: orchestratorResult.sources,
    stream: orchestratorResult.stream,
    userMessageIndex,
  };
}
