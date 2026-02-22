import { eq, and, desc, sql } from 'drizzle-orm';
import { withTenant, glRecurringTemplates, glJournalEntries } from '@oppsera/db';
import type { RecurringTemplate, TemplateLine } from '../commands/manage-recurring-templates';

export interface ListRecurringTemplatesInput {
  tenantId: string;
  isActive?: boolean;
  cursor?: string;
  limit?: number;
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

export async function listRecurringTemplates(
  input: ListRecurringTemplatesInput,
): Promise<{ items: RecurringTemplate[]; cursor: string | null; hasMore: boolean }> {
  const limit = input.limit ?? 50;

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [eq(glRecurringTemplates.tenantId, input.tenantId)];

    if (input.isActive !== undefined) {
      conditions.push(eq(glRecurringTemplates.isActive, input.isActive));
    }
    if (input.cursor) {
      conditions.push(sql`${glRecurringTemplates.id} < ${input.cursor}`);
    }

    const rows = await tx
      .select()
      .from(glRecurringTemplates)
      .where(and(...conditions))
      .orderBy(desc(glRecurringTemplates.name))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return {
      items: items.map(mapRow),
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}

export async function getRecurringTemplate(
  tenantId: string,
  templateId: string,
): Promise<RecurringTemplate | null> {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(glRecurringTemplates)
      .where(and(eq(glRecurringTemplates.id, templateId), eq(glRecurringTemplates.tenantId, tenantId)))
      .limit(1);

    return row ? mapRow(row) : null;
  });
}

export async function getRecurringTemplateHistory(
  tenantId: string,
  templateId: string,
  limit: number = 20,
): Promise<Array<{ id: string; journalNumber: number; businessDate: string; status: string; postedAt: string | null }>> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: glJournalEntries.id,
        journalNumber: glJournalEntries.journalNumber,
        businessDate: glJournalEntries.businessDate,
        status: glJournalEntries.status,
        postedAt: glJournalEntries.postedAt,
      })
      .from(glJournalEntries)
      .where(
        and(
          eq(glJournalEntries.tenantId, tenantId),
          eq(glJournalEntries.sourceModule, 'recurring'),
          sql`${glJournalEntries.sourceReferenceId} LIKE ${templateId + '-%'}`,
        ),
      )
      .orderBy(desc(glJournalEntries.businessDate))
      .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      journalNumber: r.journalNumber,
      businessDate: r.businessDate,
      status: r.status,
      postedAt: r.postedAt?.toISOString() ?? null,
    }));
  });
}
