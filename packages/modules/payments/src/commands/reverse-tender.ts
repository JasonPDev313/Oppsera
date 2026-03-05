import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError, ValidationError } from '@oppsera/shared';
import { tenders, tenderReversals, paymentJournalEntries, orders } from '@oppsera/db';
import { eq, and, inArray } from 'drizzle-orm';
import type { ReverseTenderInput } from '../validation';
import {
  checkIdempotency,
  saveIdempotencyKey,
} from '@oppsera/core/helpers/idempotency';
import {
  incrementVersion,
} from '@oppsera/core/helpers/optimistic-lock';

export async function reverseTender(
  ctx: RequestContext,
  tenderId: string,
  input: ReverseTenderInput,
) {
  if (!ctx.locationId) {
    throw new AppError(
      'LOCATION_REQUIRED',
      'X-Location-Id header is required',
      400,
    );
  }

  if (!input.clientRequestId) {
    throw new ValidationError(
      'clientRequestId is required for tender operations',
    );
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx,
      ctx.tenantId,
      input.clientRequestId,
      'reverseTender',
    );
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] }; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON from DB

    // 1. Fetch the original tender
    const [tender] = await tx
      .select()
      .from(tenders)
      .where(
        and(
          eq(tenders.tenantId, ctx.tenantId),
          eq(tenders.id, tenderId),
        ),
      );

    if (!tender) {
      throw new AppError('TENDER_NOT_FOUND', `Tender ${tenderId} not found`, 404);
    }

    if (tender.status !== 'captured' && tender.status !== 'partially_reversed') {
      throw new ValidationError(`Tender is in status '${tender.status}', expected 'captured' or 'partially_reversed'`);
    }

    // 2. Check cumulative reversals don't exceed tender amount
    const existingReversals = await tx
      .select()
      .from(tenderReversals)
      .where(
        and(
          eq(tenderReversals.tenantId, ctx.tenantId),
          eq(tenderReversals.originalTenderId, tenderId),
        ),
      );

    const alreadyReversed = existingReversals.reduce((sum, r) => sum + r.amount, 0);

    // 3. Validate reversal amount against remaining reversible amount
    const maxReversible = tender.amount - alreadyReversed;
    if (input.amount > maxReversible) {
      throw new ValidationError(
        `Reversal amount (${input.amount}) exceeds remaining reversible amount (${maxReversible})`,
        [{ field: 'amount', message: `Max reversible amount is ${maxReversible}` }],
      );
    }

    // 4. Create reversal record
    const [reversal] = await tx
      .insert(tenderReversals)
      .values({
        tenantId: ctx.tenantId,
        locationId: ctx.locationId!,
        originalTenderId: tenderId,
        orderId: tender.orderId,
        reversalType: input.reversalType,
        amount: input.amount,
        reason: input.reason,
        refundMethod: input.refundMethod ?? (tender.tenderType === 'cash' ? 'cash' : 'original_tender'),
        status: 'completed',
        createdBy: ctx.user.id,
      })
      .returning();

    if (!reversal) throw new AppError('INSERT_FAILED', 'Failed to create reversal record', 500);

    // Bug 9 fix: update the original tender's status to 'reversed' so queries
    // and downstream logic can identify reversed tenders without joining tenderReversals.
    // Full reversals mark the tender 'reversed'; partial reversals mark it 'partially_reversed'.
    const isFullReversal = input.amount === tender.amount;
    await tx
      .update(tenders)
      .set({ status: isFullReversal ? 'reversed' : 'partially_reversed' })
      .where(and(eq(tenders.id, tenderId), eq(tenders.tenantId, ctx.tenantId)));

    // 5. Generate reversing GL journal entry
    const originalJournals = await tx
      .select()
      .from(paymentJournalEntries)
      .where(
        and(
          eq(paymentJournalEntries.tenantId, ctx.tenantId),
          eq(paymentJournalEntries.referenceType, 'tender'),
          eq(paymentJournalEntries.referenceId, tenderId),
          eq(paymentJournalEntries.postingStatus, 'posted'),
        ),
      );

    if (originalJournals.length > 0) {
      const original = originalJournals[0]!;
      const originalEntries = original.entries as Array<{
        accountCode: string;
        accountName: string;
        debit: number;
        credit: number;
      }>;

      // For partial reversal, prorate the GL entries
      const reversalRatio = input.amount / tender.amount;
      const reversedEntries = originalEntries.map((e) => ({
        accountCode: e.accountCode,
        accountName: e.accountName,
        debit: Math.round(e.credit * reversalRatio),
        credit: Math.round(e.debit * reversalRatio),
      }));

      // Balance check: ensure debits == credits after rounding
      const totalDebit = reversedEntries.reduce((s, e) => s + e.debit, 0);
      const totalCredit = reversedEntries.reduce((s, e) => s + e.credit, 0);
      if (totalDebit !== totalCredit) {
        const diff = totalDebit - totalCredit;
        // Always use a dedicated rounding entry to correct imbalance
        reversedEntries.push({
          accountCode: '4999',
          accountName: 'Rounding Adjustment',
          debit: diff < 0 ? -diff : 0,
          credit: diff > 0 ? diff : 0,
        });
      }

      await tx.insert(paymentJournalEntries).values({
        tenantId: ctx.tenantId,
        locationId: ctx.locationId!,
        referenceType: 'reversal',
        referenceId: reversal!.id,
        orderId: tender.orderId,
        entries: reversedEntries,
        businessDate: tender.businessDate,
        sourceModule: 'payments',
        postingStatus: 'posted',
      });

      // Mark original journal as voided if full reversal
      if (input.amount === tender.amount) {
        await tx
          .update(paymentJournalEntries)
          .set({ postingStatus: 'voided' })
          .where(and(eq(paymentJournalEntries.id, original.id), eq(paymentJournalEntries.tenantId, ctx.tenantId)));
      }
    }

    // 6. If this was a full reversal, check if order needs status change
    // Recalculate remaining balance
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, tender.orderId), eq(orders.tenantId, ctx.tenantId)));

    if (order && order.status === 'paid') {
      // Check if there are still active (non-reversed) tenders covering the total
      const allTenders = await tx
        .select()
        .from(tenders)
        .where(
          and(
            eq(tenders.tenantId, ctx.tenantId),
            eq(tenders.orderId, tender.orderId),
            inArray(tenders.status, ['captured', 'partially_reversed']),
          ),
        );

      const allReversals = await tx
        .select()
        .from(tenderReversals)
        .where(
          and(
            eq(tenderReversals.tenantId, ctx.tenantId),
            eq(tenderReversals.orderId, tender.orderId),
          ),
        );

      const reversalMap = new Map<string, number>();
      for (const rev of allReversals) {
        reversalMap.set(
          rev.originalTenderId,
          (reversalMap.get(rev.originalTenderId) || 0) + rev.amount,
        );
      }

      const netTendered = allTenders.reduce((sum, t) => {
        const reversed = reversalMap.get(t.id) || 0;
        return sum + t.amount - reversed;
      }, 0);

      if (netTendered < order.total) {
        // Order is no longer fully paid — revert to placed
        const now = new Date();
        await tx
          .update(orders)
          .set({
            status: 'placed',
            paidAt: null,
            updatedBy: ctx.user.id,
            updatedAt: now,
          })
          .where(and(eq(orders.id, tender.orderId), eq(orders.tenantId, ctx.tenantId)));
      }
    }

    await incrementVersion(tx, tender.orderId, ctx.tenantId);

    await saveIdempotencyKey(
      tx,
      ctx.tenantId,
      input.clientRequestId,
      'reverseTender',
      {
        reversalId: reversal.id,
        originalTenderId: tenderId,
        amount: input.amount,
        reversalType: input.reversalType,
      },
    );

    // 7. Build event
    const event = buildEventFromContext(ctx, 'tender.reversed.v1', {
      reversalId: reversal.id,
      originalTenderId: tenderId,
      orderId: tender.orderId,
      amount: input.amount,
      reason: input.reason,
      reversalType: input.reversalType,
      refundMethod: reversal.refundMethod,
    });

    return {
      result: {
        reversalId: reversal.id,
        originalTenderId: tenderId,
        orderId: tender.orderId,
        amount: input.amount,
        reversalType: input.reversalType,
        refundMethod: reversal.refundMethod,
      },
      events: [event],
    };
  });

  auditLogDeferred(ctx, 'tender.reversed', 'tender', tenderId);
  return result;
}
