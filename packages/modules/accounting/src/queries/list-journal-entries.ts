import { eq, and, desc, gte, lte, lt, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { glJournalEntries } from '@oppsera/db';

interface ListJournalEntriesInput {
  tenantId: string;
  cursor?: string;
  limit?: number;
  startDate?: string;
  endDate?: string;
  sourceModule?: string;
  status?: string;
  accountId?: string;
}

export async function listJournalEntries(input: ListJournalEntriesInput) {
  const limit = input.limit ?? 50;

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [eq(glJournalEntries.tenantId, input.tenantId)];

    if (input.cursor) {
      conditions.push(lt(glJournalEntries.id, input.cursor));
    }
    if (input.startDate) {
      conditions.push(gte(glJournalEntries.businessDate, input.startDate));
    }
    if (input.endDate) {
      conditions.push(lte(glJournalEntries.businessDate, input.endDate));
    }
    if (input.sourceModule) {
      conditions.push(eq(glJournalEntries.sourceModule, input.sourceModule));
    }
    if (input.status) {
      conditions.push(eq(glJournalEntries.status, input.status));
    }

    // If filtering by accountId, join through gl_journal_lines
    let rows;
    if (input.accountId) {
      const result = await tx.execute(sql`
        SELECT DISTINCT je.*
        FROM gl_journal_entries je
        INNER JOIN gl_journal_lines jl ON jl.journal_entry_id = je.id
        WHERE je.tenant_id = ${input.tenantId}
          AND jl.account_id = ${input.accountId}
          ${input.cursor ? sql`AND je.id < ${input.cursor}` : sql``}
          ${input.startDate ? sql`AND je.business_date >= ${input.startDate}` : sql``}
          ${input.endDate ? sql`AND je.business_date <= ${input.endDate}` : sql``}
          ${input.sourceModule ? sql`AND je.source_module = ${input.sourceModule}` : sql``}
          ${input.status ? sql`AND je.status = ${input.status}` : sql``}
        ORDER BY je.id DESC
        LIMIT ${limit + 1}
      `);
      rows = Array.from(result as Iterable<Record<string, unknown>>);
    } else {
      rows = await tx
        .select()
        .from(glJournalEntries)
        .where(and(...conditions))
        .orderBy(desc(glJournalEntries.id))
        .limit(limit + 1);
    }

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return {
      items,
      cursor: hasMore ? (items[items.length - 1] as any)?.id ?? null : null,
      hasMore,
    };
  });
}
