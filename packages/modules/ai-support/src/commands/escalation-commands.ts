import { eq, and, asc } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { auditLog } from '@oppsera/core/audit/helpers';
import { NotFoundError, generateUlid } from '@oppsera/shared';
import {
  db,
  aiSupportEscalations,
  aiAssistantThreads,
  aiAssistantMessages,
} from '@oppsera/db';
import type { CreateEscalationInput, UpdateEscalationInput } from '../types';

// ── Types ────────────────────────────────────────────────────────────

export type EscalationRow = typeof aiSupportEscalations.$inferSelect;

// ── Create Escalation ────────────────────────────────────────────────

export async function createEscalation(
  ctx: RequestContext,
  input: CreateEscalationInput,
): Promise<EscalationRow> {
  // 1. Load thread — must belong to this tenant
  const [thread] = await db
    .select()
    .from(aiAssistantThreads)
    .where(
      and(
        eq(aiAssistantThreads.id, input.threadId),
        eq(aiAssistantThreads.tenantId, ctx.tenantId),
      ),
    )
    .limit(1);

  if (!thread) {
    throw new NotFoundError('Thread', input.threadId);
  }

  // 2. Load thread messages ordered by createdAt asc
  const messages = await db
    .select()
    .from(aiAssistantMessages)
    .where(
      and(
        eq(aiAssistantMessages.threadId, input.threadId),
        eq(aiAssistantMessages.tenantId, ctx.tenantId),
      ),
    )
    .orderBy(asc(aiAssistantMessages.createdAt));

  // 3. Generate summary via Claude Haiku
  let summary: string | null = null;
  if (messages.length > 0) {
    const formatted = messages
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.messageText}`)
      .join('\n');

    try {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (apiKey) {
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 256,
            system:
              'Summarize this support conversation in 2-3 sentences. Focus on what the user needs help with and what has been tried so far.',
            messages: [{ role: 'user', content: formatted.slice(0, 40_000) }],
          }),
          signal: AbortSignal.timeout(15_000),
        });

        if (resp.ok) {
          const data = (await resp.json()) as {
            content?: Array<{ type: string; text?: string }>;
          };
          const textBlock = data.content?.find((b) => b.type === 'text');
          if (textBlock?.text) {
            summary = textBlock.text.trim();
          }
        }
      }
    } catch (e) {
      console.error('Escalation summary generation failed:', e instanceof Error ? e.message : e);
    }
  }

  // 4. Determine priority
  let priority: 'low' | 'medium' | 'high' | 'critical';
  if (input.priority) {
    priority = input.priority;
  } else {
    // Find last assistant message
    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m.role === 'assistant');
    priority = lastAssistant?.answerConfidence === 'low' ? 'high' : 'medium';
  }

  // 5. Insert escalation
  const [escalation] = await db
    .insert(aiSupportEscalations)
    .values({
      id: generateUlid(),
      tenantId: ctx.tenantId,
      threadId: input.threadId,
      userId: ctx.user.id,
      summary,
      reason: input.reason ?? 'user_requested',
      status: 'open',
      priority,
    })
    .returning();

  // 6. Update thread outcome to 'escalated' (tenant-scoped for defense-in-depth)
  await db
    .update(aiAssistantThreads)
    .set({ outcome: 'escalated', updatedAt: new Date() })
    .where(
      and(
        eq(aiAssistantThreads.id, input.threadId),
        eq(aiAssistantThreads.tenantId, ctx.tenantId),
      ),
    );

  // 7. Audit log
  await auditLog(
    ctx,
    'ai_support.escalation.created',
    'ai_support_escalation',
    escalation!.id,
  ).catch((e: unknown) => {
    console.error('Audit log failed for ai_support.escalation.created:', e instanceof Error ? e.message : e);
  });

  return escalation!;
}

// ── Update Escalation ────────────────────────────────────────────────

export async function updateEscalation(
  ctx: RequestContext,
  escalationId: string,
  input: UpdateEscalationInput,
): Promise<EscalationRow> {
  // 1. Load escalation — verify it exists and belongs to this tenant
  const [existing] = await db
    .select()
    .from(aiSupportEscalations)
    .where(
      and(
        eq(aiSupportEscalations.id, escalationId),
        eq(aiSupportEscalations.tenantId, ctx.tenantId),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new NotFoundError('Escalation', escalationId);
  }

  // 2. Build set clause
  const updates: Partial<typeof aiSupportEscalations.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.status !== undefined) {
    updates.status = input.status;
    if (input.status === 'resolved') {
      updates.resolvedAt = new Date();
    }
  }
  if (input.assignedTo !== undefined) updates.assignedTo = input.assignedTo;
  if (input.resolutionNotes !== undefined) updates.resolutionNotes = input.resolutionNotes;

  const [updated] = await db
    .update(aiSupportEscalations)
    .set(updates)
    .where(
      and(
        eq(aiSupportEscalations.id, escalationId),
        eq(aiSupportEscalations.tenantId, ctx.tenantId),
      ),
    )
    .returning();

  await auditLog(
    ctx,
    'ai_support.escalation.updated',
    'ai_support_escalation',
    escalationId,
  ).catch((e: unknown) => {
    console.error('Audit log failed for ai_support.escalation.updated:', e instanceof Error ? e.message : e);
  });

  return updated!;
}
