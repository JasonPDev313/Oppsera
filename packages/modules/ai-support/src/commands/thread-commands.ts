import { eq, and, asc } from 'drizzle-orm';
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
import { MAX_MESSAGES_PER_THREAD, MAX_CONCURRENT_THREADS_PER_USER } from '../constants';

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
  const [existing] = await db
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

  if (!existing) {
    throw new NotFoundError('Thread', threadId);
  }

  const [updated] = await db
    .update(aiAssistantThreads)
    .set({
      status: updates?.status ?? 'closed',
      questionType: updates?.questionType ?? existing.questionType,
      outcome: updates?.outcome ?? existing.outcome,
      issueTag: updates?.issueTag ?? existing.issueTag,
      endedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(aiAssistantThreads.id, threadId))
    .returning();

  await auditLog(ctx, 'ai_support.thread.closed', 'ai_assistant_thread', threadId).catch(
    (e: unknown) => {
      console.error('Audit log failed for ai_support.thread.closed:', e instanceof Error ? e.message : e);
    },
  );

  return updated!;
}

// ── Send Message ────────────────────────────────────────────────────

interface SendMessageResult {
  userMessage: typeof aiAssistantMessages.$inferSelect;
  assistantMessage: typeof aiAssistantMessages.$inferSelect;
  confidence: ConfidenceLevel;
  sourceTierUsed: SourceTier;
  sources: string[];
  stream: ReadableStream<Uint8Array>;
}

export async function sendMessage(
  ctx: RequestContext,
  threadId: string,
  messageText: string,
  contextSnapshot: AiAssistantContext,
): Promise<SendMessageResult> {
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

  // Check message count limit
  const existingMessages = await db
    .select({ id: aiAssistantMessages.id })
    .from(aiAssistantMessages)
    .where(
      and(
        eq(aiAssistantMessages.threadId, threadId),
        eq(aiAssistantMessages.tenantId, ctx.tenantId),
      ),
    );

  if (existingMessages.length >= MAX_MESSAGES_PER_THREAD) {
    throw new AppError(
      'MAX_MESSAGES_REACHED',
      `Thread has reached the maximum of ${MAX_MESSAGES_PER_THREAD} messages. Please start a new thread.`,
      409,
    );
  }

  // Insert user message
  const [userMessage] = await db
    .insert(aiAssistantMessages)
    .values({
      tenantId: ctx.tenantId,
      threadId,
      role: 'user',
      messageText,
    })
    .returning();

  // Save context snapshot
  await db.insert(aiAssistantContextSnapshots).values({
    tenantId: ctx.tenantId,
    threadId,
    messageId: userMessage!.id,
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

  // Load thread history for context — collect all DB data BEFORE the LLM call
  // so we don't hold a DB connection during the potentially 60s orchestrator call.
  const historyRows = await db
    .select({
      role: aiAssistantMessages.role,
      messageText: aiAssistantMessages.messageText,
    })
    .from(aiAssistantMessages)
    .where(
      and(
        eq(aiAssistantMessages.threadId, threadId),
        eq(aiAssistantMessages.tenantId, ctx.tenantId),
      ),
    )
    .orderBy(asc(aiAssistantMessages.createdAt));

  // Exclude the just-inserted user message from history (it will be added by the orchestrator)
  const threadHistory = historyRows
    .filter((r) => r.role === 'user' || r.role === 'assistant')
    .slice(0, -1) // Remove the last user message we just inserted
    .map((r) => ({ role: r.role, content: r.messageText }));

  // ── LLM call — no DB connections held during this potentially long call ──
  const orchestratorResult = await runOrchestratorCollected({
    messageText,
    context: contextSnapshot,
    threadHistory,
    mode: 'staff', // Default to staff mode; customer mode can be added later
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
      modelName: 'claude-sonnet-4-20250514',
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
    userMessage: userMessage!,
    assistantMessage: assistantMessage!,
    confidence: orchestratorResult.confidence,
    sourceTierUsed: orchestratorResult.sourceTierUsed,
    sources: orchestratorResult.sources,
    stream: orchestratorResult.stream,
  };
}
