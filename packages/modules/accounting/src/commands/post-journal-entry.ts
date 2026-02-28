import { eq, and, ne } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { glJournalEntries, glJournalLines } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import { validateJournal } from '../helpers/validate-journal';
import { generateJournalNumber } from '../helpers/generate-journal-number';
import { ACCOUNTING_EVENTS } from '../events/types';
import type { PostJournalEntryInput } from '../validation';

interface PostJournalEntryOptions {
  hasControlAccountPermission?: boolean;
}

export async function postJournalEntry(
  ctx: RequestContext,
  input: PostJournalEntryInput,
  options?: PostJournalEntryOptions,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Idempotency: if sourceReferenceId is provided, check the unique index
    if (input.sourceReferenceId) {
      const [existing] = await tx
        .select()
        .from(glJournalEntries)
        .where(
          and(
            eq(glJournalEntries.tenantId, ctx.tenantId),
            eq(glJournalEntries.sourceModule, input.sourceModule),
            eq(glJournalEntries.sourceReferenceId, input.sourceReferenceId),
            ne(glJournalEntries.status, 'voided'),
          ),
        )
        .limit(1);

      if (existing) {
        // Return existing entry — idempotent, no error
        const existingLines = await tx
          .select()
          .from(glJournalLines)
          .where(eq(glJournalLines.journalEntryId, existing.id));

        return { result: { ...existing, lines: existingLines }, events: [] };
      }
    }

    // 2. Validate journal
    const validated = await validateJournal(tx, {
      tenantId: ctx.tenantId,
      businessDate: input.businessDate,
      currency: input.currency,
      transactionCurrency: input.transactionCurrency,
      exchangeRate: input.exchangeRate,
      lines: input.lines,
      sourceModule: input.sourceModule,
      hasControlAccountPermission: options?.hasControlAccountPermission ?? false,
    });

    // 3. Generate journal number atomically
    const journalNumber = await generateJournalNumber(tx, ctx.tenantId);

    // 4. Determine status
    const shouldPost = input.forcePost || validated.settings.autoPostMode === 'auto_post';
    const status = shouldPost ? 'posted' : 'draft';
    const postedAt = shouldPost ? new Date() : null;

    // 5. Insert journal entry
    const entryId = generateUlid();
    const [entry] = await tx
      .insert(glJournalEntries)
      .values({
        id: entryId,
        tenantId: ctx.tenantId,
        journalNumber,
        sourceModule: input.sourceModule,
        sourceReferenceId: input.sourceReferenceId ?? null,
        businessDate: input.businessDate,
        postingPeriod: validated.postingPeriod,
        currency: validated.settings.baseCurrency,
        transactionCurrency: validated.transactionCurrency,
        exchangeRate: validated.exchangeRate,
        status,
        memo: input.memo ?? null,
        postedAt,
        createdBy: ctx.user.id,
      })
      .returning();

    // 6. Insert journal lines
    const allLines = [...input.lines];
    if (validated.roundingLine) {
      allLines.push(validated.roundingLine);
    }

    const insertedLines = [];
    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i]!;
      const [inserted] = await tx
        .insert(glJournalLines)
        .values({
          id: generateUlid(),
          journalEntryId: entryId,
          accountId: line.accountId,
          debitAmount: line.debitAmount ?? '0',
          creditAmount: line.creditAmount ?? '0',
          locationId: line.locationId ?? null,
          departmentId: line.departmentId ?? null,
          customerId: line.customerId ?? null,
          vendorId: line.vendorId ?? null,
          profitCenterId: line.profitCenterId ?? null,
          subDepartmentId: line.subDepartmentId ?? null,
          terminalId: line.terminalId ?? null,
          channel: line.channel ?? null,
          memo: line.memo ?? null,
          sortOrder: i,
        })
        .returning();
      insertedLines.push(inserted!);
    }

    // 7. Compute total for event
    let totalAmount = 0;
    for (const line of insertedLines) {
      totalAmount += Number(line.debitAmount);
    }

    // 8. Build event
    const eventType = status === 'posted'
      ? ACCOUNTING_EVENTS.JOURNAL_POSTED
      : ACCOUNTING_EVENTS.JOURNAL_DRAFTED;

    const event = buildEventFromContext(ctx, eventType, {
      journalEntryId: entryId,
      journalNumber,
      sourceModule: input.sourceModule,
      sourceReferenceId: input.sourceReferenceId ?? null,
      businessDate: input.businessDate,
      totalAmount,
      lineCount: insertedLines.length,
    });

    return {
      result: { ...entry!, lines: insertedLines },
      events: [event],
    };
  });

  await auditLog(ctx, 'accounting.journal.created', 'gl_journal_entry', result.id);
  return result;
}
