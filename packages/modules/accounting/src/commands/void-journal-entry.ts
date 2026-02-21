import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { glJournalEntries, glJournalLines } from '@oppsera/db';
import { generateUlid, NotFoundError, AppError } from '@oppsera/shared';
import { generateJournalNumber } from '../helpers/generate-journal-number';
import { ACCOUNTING_EVENTS } from '../events/types';

export async function voidJournalEntry(
  ctx: RequestContext,
  entryId: string,
  reason: string,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Load the posted entry
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

    if (entry.status !== 'posted') {
      throw new AppError(
        'INVALID_STATUS',
        `Cannot void journal entry with status '${entry.status}'. Only posted entries can be voided.`,
        409,
      );
    }

    // 2. Load original lines
    const originalLines = await tx
      .select()
      .from(glJournalLines)
      .where(eq(glJournalLines.journalEntryId, entryId));

    // 3. Mark original as voided
    await tx
      .update(glJournalEntries)
      .set({
        status: 'voided',
        voidedAt: new Date(),
        voidReason: reason,
      })
      .where(eq(glJournalEntries.id, entryId));

    // 4. Create reversal entry (debits↔credits swapped)
    const reversalNumber = await generateJournalNumber(tx, ctx.tenantId);
    const reversalId = generateUlid();

    const [reversal] = await tx
      .insert(glJournalEntries)
      .values({
        id: reversalId,
        tenantId: ctx.tenantId,
        journalNumber: reversalNumber,
        sourceModule: entry.sourceModule,
        sourceReferenceId: null, // reversal has no sourceReferenceId
        businessDate: entry.businessDate,
        postingPeriod: entry.postingPeriod,
        currency: entry.currency,
        status: 'posted',
        memo: `Reversal of JE #${entry.journalNumber}: ${reason}`,
        postedAt: new Date(),
        reversalOfId: entryId,
        createdBy: ctx.user.id,
      })
      .returning();

    // 5. Insert reversed lines (swap debit/credit)
    const reversedLines = [];
    for (let i = 0; i < originalLines.length; i++) {
      const origLine = originalLines[i]!;
      const [reversedLine] = await tx
        .insert(glJournalLines)
        .values({
          id: generateUlid(),
          journalEntryId: reversalId,
          accountId: origLine.accountId,
          debitAmount: origLine.creditAmount, // swap
          creditAmount: origLine.debitAmount, // swap
          locationId: origLine.locationId,
          departmentId: origLine.departmentId,
          customerId: origLine.customerId,
          vendorId: origLine.vendorId,
          memo: origLine.memo ? `Reversal: ${origLine.memo}` : 'Reversal',
          sortOrder: i,
        })
        .returning();
      reversedLines.push(reversedLine!);
    }

    const event = buildEventFromContext(ctx, ACCOUNTING_EVENTS.JOURNAL_VOIDED, {
      journalEntryId: entryId,
      reversalEntryId: reversalId,
      reason,
    });

    return {
      result: {
        voidedEntry: { ...entry, status: 'voided' as const, voidedAt: new Date(), voidReason: reason },
        reversalEntry: { ...reversal!, lines: reversedLines },
      },
      events: [event],
    };
  });

  await auditLog(ctx, 'accounting.journal.voided', 'gl_journal_entry', entryId);
  return result;
}
