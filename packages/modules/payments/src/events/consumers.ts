import { eq, and } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { tenders, tenderReversals, paymentJournalEntries } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';

export async function handleOrderVoided(event: EventEnvelope): Promise<void> {
  const { orderId, reason } = event.data as {
    orderId: string;
    reason: string;
  };

  // Check if legacy GL posting is still enabled.
  // When enableLegacyGlPosting is false, the proper GL system (void-posting-adapter)
  // handles GL reversals — skip legacy payment_journal_entries reversal.
  let enableLegacyGlPosting = true; // default: always do legacy GL for backward compat
  try {
    const accountingApi = getAccountingPostingApi();
    const settings = await accountingApi.getSettings(event.tenantId);
    enableLegacyGlPosting = settings.enableLegacyGlPosting ?? true;
  } catch {
    // If accounting API is not initialized, legacy GL stays on (backward compat)
  }

  await withTenant(event.tenantId, async (tx) => {
    // Find all non-reversed tenders for this order
    // A tender is "reversed" if a matching tender_reversals row exists
    const allTenders = await tx
      .select()
      .from(tenders)
      .where(
        and(
          eq(tenders.tenantId, event.tenantId),
          eq(tenders.orderId, orderId),
          eq(tenders.status, 'captured'),
        ),
      );

    const existingReversals = await tx
      .select()
      .from(tenderReversals)
      .where(
        and(
          eq(tenderReversals.tenantId, event.tenantId),
          eq(tenderReversals.orderId, orderId),
        ),
      );

    const reversedTenderIds = new Set(
      existingReversals.map((r) => r.originalTenderId),
    );
    const unreversedTenders = allTenders.filter(
      (t) => !reversedTenderIds.has(t.id),
    );

    for (const tender of unreversedTenders) {
      const reversalId = generateUlid();

      // 1. Create reversal record (ALWAYS — operational, not GL)
      await (tx as any).insert(tenderReversals).values({
        id: reversalId,
        tenantId: event.tenantId,
        locationId: tender.locationId,
        originalTenderId: tender.id,
        orderId: tender.orderId,
        reversalType: 'void',
        amount: tender.amount,
        reason: reason || 'Order voided',
        refundMethod:
          tender.tenderType === 'cash' ? 'cash' : 'original_tender',
        status: 'completed',
        createdBy: event.actorUserId || 'system',
      });

      // 2. Generate legacy GL reversal entry (only when legacy GL is enabled)
      // When enableLegacyGlPosting is false, the proper GL system handles this
      // via handleOrderVoidForAccounting in the accounting module.
      if (enableLegacyGlPosting) {
        const originalJournal = await tx
          .select()
          .from(paymentJournalEntries)
          .where(
            and(
              eq(paymentJournalEntries.tenantId, event.tenantId),
              eq(paymentJournalEntries.referenceType, 'tender'),
              eq(paymentJournalEntries.referenceId, tender.id),
              eq(paymentJournalEntries.postingStatus, 'posted'),
            ),
          );

        if (originalJournal.length > 0) {
          const original = originalJournal[0]!;
          const originalEntries = original.entries as Array<{
            accountCode: string;
            accountName: string;
            debit: number;
            credit: number;
          }>;

          // Reverse: swap debits and credits
          const reversedEntries = originalEntries.map((e) => ({
            accountCode: e.accountCode,
            accountName: e.accountName,
            debit: e.credit,
            credit: e.debit,
          }));

          // Insert reversal journal entry
          await (tx as any).insert(paymentJournalEntries).values({
            tenantId: event.tenantId,
            locationId: tender.locationId,
            referenceType: 'reversal',
            referenceId: reversalId,
            orderId: tender.orderId,
            entries: reversedEntries,
            businessDate: tender.businessDate,
            sourceModule: 'payments',
            postingStatus: 'posted',
          });

          // Mark original journal entry as voided
          await (tx as any)
            .update(paymentJournalEntries)
            .set({
              postingStatus: 'voided',
            })
            .where(eq(paymentJournalEntries.id, original.id));
        }
      }
    }
  });
}
