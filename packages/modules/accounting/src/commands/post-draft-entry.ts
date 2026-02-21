import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { glJournalEntries, glJournalLines } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';
import { ImmutableEntryError } from '../errors';
import { validateJournal } from '../helpers/validate-journal';
import { ACCOUNTING_EVENTS } from '../events/types';

export async function postDraftEntry(ctx: RequestContext, entryId: string) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Load the draft entry
    const [entry] = await tx
      .select()
      .from(glJournalEntries)
      .where(
        and(
          eq(glJournalEntries.id, entryId),
          eq(glJournalEntries.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!entry) {
      throw new NotFoundError('Journal Entry', entryId);
    }

    if (entry.status !== 'draft') {
      throw new ImmutableEntryError(entryId);
    }

    // 2. Load lines
    const lines = await tx
      .select()
      .from(glJournalLines)
      .where(eq(glJournalLines.journalEntryId, entryId));

    // 3. Re-validate (balance, period lock)
    await validateJournal(tx, {
      tenantId: ctx.tenantId,
      businessDate: entry.businessDate,
      currency: entry.currency,
      lines: lines.map((l) => ({
        accountId: l.accountId,
        debitAmount: l.debitAmount,
        creditAmount: l.creditAmount,
      })),
      sourceModule: entry.sourceModule,
    });

    // 4. Update to posted
    const [updated] = await tx
      .update(glJournalEntries)
      .set({
        status: 'posted',
        postedAt: new Date(),
      })
      .where(eq(glJournalEntries.id, entryId))
      .returning();

    // 5. Compute total
    let totalAmount = 0;
    for (const line of lines) {
      totalAmount += Number(line.debitAmount);
    }

    const event = buildEventFromContext(ctx, ACCOUNTING_EVENTS.JOURNAL_POSTED, {
      journalEntryId: entryId,
      journalNumber: entry.journalNumber,
      sourceModule: entry.sourceModule,
      sourceReferenceId: entry.sourceReferenceId,
      businessDate: entry.businessDate,
      totalAmount,
      lineCount: lines.length,
    });

    return { result: { ...updated!, lines }, events: [event] };
  });

  await auditLog(ctx, 'accounting.journal.posted', 'gl_journal_entry', result.id);
  return result;
}
