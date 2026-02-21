import { eq, and } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { glJournalEntries, glJournalLines, glAccounts } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';

interface GetJournalEntryInput {
  tenantId: string;
  entryId: string;
}

export async function getJournalEntry(input: GetJournalEntryInput) {
  return withTenant(input.tenantId, async (tx) => {
    const [entry] = await tx
      .select()
      .from(glJournalEntries)
      .where(
        and(
          eq(glJournalEntries.id, input.entryId),
          eq(glJournalEntries.tenantId, input.tenantId),
        ),
      )
      .limit(1);

    if (!entry) {
      throw new NotFoundError('Journal Entry', input.entryId);
    }

    const lines = await tx
      .select({
        id: glJournalLines.id,
        journalEntryId: glJournalLines.journalEntryId,
        accountId: glJournalLines.accountId,
        accountNumber: glAccounts.accountNumber,
        accountName: glAccounts.name,
        debitAmount: glJournalLines.debitAmount,
        creditAmount: glJournalLines.creditAmount,
        locationId: glJournalLines.locationId,
        departmentId: glJournalLines.departmentId,
        customerId: glJournalLines.customerId,
        vendorId: glJournalLines.vendorId,
        memo: glJournalLines.memo,
        sortOrder: glJournalLines.sortOrder,
      })
      .from(glJournalLines)
      .innerJoin(glAccounts, eq(glAccounts.id, glJournalLines.accountId))
      .where(eq(glJournalLines.journalEntryId, input.entryId))
      .orderBy(glJournalLines.sortOrder);

    return {
      ...entry,
      lines: lines.map((l) => ({
        ...l,
        debitAmount: Number(l.debitAmount),
        creditAmount: Number(l.creditAmount),
      })),
    };
  });
}
