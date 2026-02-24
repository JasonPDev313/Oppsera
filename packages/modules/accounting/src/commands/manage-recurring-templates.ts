import { eq, and, sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import { generateUlid } from '@oppsera/shared';
import { glRecurringTemplates } from '@oppsera/db';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import { logUnmappedEvent } from '../helpers/resolve-mapping';
import { db } from '@oppsera/db';
import type {
  CreateRecurringTemplateInput,
  UpdateRecurringTemplateInput,
  ExecuteRecurringTemplateInput,
} from '../validation';

// ── Types ────────────────────────────────────────────────────

export interface TemplateLine {
  accountId: string;
  debitAmount: string;
  creditAmount: string;
  memo?: string;
}

export interface RecurringTemplate {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  frequency: string;
  dayOfPeriod: number;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  lastPostedPeriod: string | null;
  nextDueDate: string | null;
  templateLines: TemplateLine[];
  sourceModule: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapRow(row: typeof glRecurringTemplates.$inferSelect): RecurringTemplate {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    description: row.description ?? null,
    frequency: row.frequency,
    dayOfPeriod: row.dayOfPeriod,
    startDate: row.startDate,
    endDate: row.endDate ?? null,
    isActive: row.isActive,
    lastPostedPeriod: row.lastPostedPeriod ?? null,
    nextDueDate: row.nextDueDate ?? null,
    templateLines: (row.templateLines as TemplateLine[]) ?? [],
    sourceModule: row.sourceModule,
    createdBy: row.createdBy ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ── Helpers ──────────────────────────────────────────────────

function validateLinesBalance(lines: TemplateLine[]): void {
  let totalDebits = 0;
  let totalCredits = 0;
  for (const line of lines) {
    totalDebits += Number(line.debitAmount || 0);
    totalCredits += Number(line.creditAmount || 0);
  }
  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    throw new Error(`Template lines are unbalanced: debits ${totalDebits.toFixed(2)} != credits ${totalCredits.toFixed(2)}`);
  }
}

function computeNextDueDate(
  frequency: string,
  dayOfPeriod: number,
  startDate: string,
  lastPostedPeriod: string | null,
  endDate: string | null,
): string | null {
  let year: number;
  let month: number;

  if (lastPostedPeriod) {
    const [lpYear, lpMonth] = lastPostedPeriod.split('-').map(Number);
    year = lpYear!;
    month = lpMonth!;

    // Advance to next period
    if (frequency === 'monthly') {
      month += 1;
    } else if (frequency === 'quarterly') {
      month += 3;
    } else if (frequency === 'annually') {
      year += 1;
    }

    if (month > 12) {
      year += Math.floor((month - 1) / 12);
      month = ((month - 1) % 12) + 1;
    }
  } else {
    // Use start date
    const start = new Date(startDate + 'T00:00:00Z');
    year = start.getUTCFullYear();
    month = start.getUTCMonth() + 1;
  }

  // Compute the actual day
  let day = dayOfPeriod;
  if (day === 0) {
    // Last day of the month
    day = new Date(year, month, 0).getDate();
  } else {
    const maxDay = new Date(year, month, 0).getDate();
    day = Math.min(day, maxDay);
  }

  const dueStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  // Check end date
  if (endDate && dueStr > endDate) return null;

  return dueStr;
}

// ── Commands ─────────────────────────────────────────────────

export async function createRecurringTemplate(
  ctx: RequestContext,
  input: CreateRecurringTemplateInput,
): Promise<RecurringTemplate> {
  validateLinesBalance(input.templateLines as TemplateLine[]);

  const nextDueDate = computeNextDueDate(
    input.frequency,
    input.dayOfPeriod ?? 1,
    input.startDate,
    null,
    input.endDate ?? null,
  );

  const result = await publishWithOutbox(ctx, async (tx) => {
    const id = generateUlid();
    const now = new Date();

    const [created] = await tx
      .insert(glRecurringTemplates)
      .values({
        id,
        tenantId: ctx.tenantId,
        name: input.name,
        description: input.description ?? null,
        frequency: input.frequency,
        dayOfPeriod: input.dayOfPeriod ?? 1,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        isActive: true,
        nextDueDate,
        templateLines: input.templateLines,
        sourceModule: 'recurring',
        createdBy: ctx.user.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return { result: mapRow(created!), events: [] };
  });

  await auditLog(ctx, 'accounting.recurring_template.created', 'gl_recurring_template', result.id);
  return result;
}

export async function updateRecurringTemplate(
  ctx: RequestContext,
  input: UpdateRecurringTemplateInput,
): Promise<RecurringTemplate> {
  if (input.templateLines) {
    validateLinesBalance(input.templateLines as TemplateLine[]);
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch existing
    const [existing] = await tx
      .select()
      .from(glRecurringTemplates)
      .where(and(eq(glRecurringTemplates.id, input.id), eq(glRecurringTemplates.tenantId, ctx.tenantId)))
      .limit(1);

    if (!existing) throw new Error('Recurring template not found');

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.frequency !== undefined) updates.frequency = input.frequency;
    if (input.dayOfPeriod !== undefined) updates.dayOfPeriod = input.dayOfPeriod;
    if (input.startDate !== undefined) updates.startDate = input.startDate;
    if (input.endDate !== undefined) updates.endDate = input.endDate;
    if (input.isActive !== undefined) updates.isActive = input.isActive;
    if (input.templateLines !== undefined) updates.templateLines = input.templateLines;

    // Recompute next due date
    const freq = (input.frequency ?? existing.frequency) as string;
    const day = input.dayOfPeriod ?? existing.dayOfPeriod;
    const start = input.startDate ?? existing.startDate;
    const end = input.endDate !== undefined ? input.endDate : existing.endDate;
    updates.nextDueDate = computeNextDueDate(
      freq,
      day,
      start,
      existing.lastPostedPeriod,
      end,
    );

    const [updated] = await tx
      .update(glRecurringTemplates)
      .set(updates)
      .where(and(eq(glRecurringTemplates.id, input.id), eq(glRecurringTemplates.tenantId, ctx.tenantId)))
      .returning();

    return { result: mapRow(updated!), events: [] };
  });

  await auditLog(ctx, 'accounting.recurring_template.updated', 'gl_recurring_template', result.id);
  return result;
}

export async function deactivateRecurringTemplate(
  ctx: RequestContext,
  templateId: string,
): Promise<RecurringTemplate> {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [updated] = await tx
      .update(glRecurringTemplates)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(glRecurringTemplates.id, templateId), eq(glRecurringTemplates.tenantId, ctx.tenantId)))
      .returning();

    if (!updated) throw new Error('Recurring template not found');
    return { result: mapRow(updated), events: [] };
  });

  await auditLog(ctx, 'accounting.recurring_template.deactivated', 'gl_recurring_template', result.id);
  return result;
}

export async function executeRecurringTemplate(
  ctx: RequestContext,
  input: ExecuteRecurringTemplateInput,
): Promise<{ journalEntryId: string; journalNumber: number }> {
  // Fetch the template
  const [template] = await db
    .select()
    .from(glRecurringTemplates)
    .where(and(eq(glRecurringTemplates.id, input.templateId), eq(glRecurringTemplates.tenantId, ctx.tenantId)))
    .limit(1);

  if (!template) throw new Error('Recurring template not found');
  if (!template.isActive) throw new Error('Template is inactive');

  const businessDate = input.businessDate ?? new Date().toISOString().slice(0, 10);
  const postingPeriod = businessDate.slice(0, 7); // 'YYYY-MM'
  const sourceRefId = `${template.id}-${postingPeriod}`;

  const lines = (template.templateLines as TemplateLine[]).map((line) => ({
    accountId: line.accountId,
    debitAmount: line.debitAmount || '0',
    creditAmount: line.creditAmount || '0',
    memo: line.memo,
  }));

  try {
    const postingApi = getAccountingPostingApi();
    const result = await postingApi.postEntry(ctx, {
      businessDate,
      sourceModule: 'recurring',
      sourceReferenceId: sourceRefId,
      memo: `Recurring: ${template.name} (${postingPeriod})`,
      currency: 'USD',
      lines,
      forcePost: true,
    });

    // Update template's last posted period and next due date
    const nextDueDate = computeNextDueDate(
      template.frequency,
      template.dayOfPeriod,
      template.startDate,
      postingPeriod,
      template.endDate,
    );

    await db
      .update(glRecurringTemplates)
      .set({
        lastPostedPeriod: postingPeriod,
        nextDueDate,
        isActive: nextDueDate !== null ? template.isActive : false, // auto-deactivate if past end date
        updatedAt: new Date(),
      })
      .where(eq(glRecurringTemplates.id, template.id));

    await auditLog(ctx, 'accounting.recurring_template.executed', 'gl_recurring_template', template.id, undefined, {
      postingPeriod,
      journalEntryId: result.id,
    });

    return { journalEntryId: result.id, journalNumber: result.journalNumber };
  } catch (err) {
    // Log the failure but don't block other templates
    await logUnmappedEvent(db, ctx.tenantId, {
      eventType: 'recurring_template_failed',
      sourceModule: 'recurring',
      sourceReferenceId: sourceRefId,
      entityType: 'gl_recurring_template',
      entityId: template.id,
      reason: err instanceof Error ? err.message : 'Unknown error',
    });
    throw err;
  }
}

export async function executeDueRecurringEntries(
  ctx: RequestContext,
): Promise<{ executed: number; failed: number; results: Array<{ templateId: string; templateName: string; status: 'success' | 'failed'; error?: string }> }> {
  const today = new Date().toISOString().slice(0, 10);

  const dueTemplates = await db
    .select()
    .from(glRecurringTemplates)
    .where(
      and(
        eq(glRecurringTemplates.tenantId, ctx.tenantId),
        eq(glRecurringTemplates.isActive, true),
        sql`${glRecurringTemplates.nextDueDate} <= ${today}`,
      ),
    );

  let executed = 0;
  let failed = 0;
  const results: Array<{ templateId: string; templateName: string; status: 'success' | 'failed'; error?: string }> = [];

  for (const template of dueTemplates) {
    try {
      await executeRecurringTemplate(ctx, { templateId: template.id, businessDate: today });
      executed++;
      results.push({ templateId: template.id, templateName: template.name, status: 'success' });
    } catch (err) {
      failed++;
      results.push({
        templateId: template.id,
        templateName: template.name,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return { executed, failed, results };
}
