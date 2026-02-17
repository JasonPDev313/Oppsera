import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError, ValidationError, ConflictError } from '@oppsera/shared';
import { tenders, tenderReversals, paymentJournalEntries } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { ReverseTenderInput } from '../validation';
import {
  checkIdempotency,
  saveIdempotencyKey,
} from '@oppsera/module-orders/helpers/idempotency';
import {
  incrementVersion,
} from '@oppsera/module-orders/helpers/optimistic-lock';

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
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    // 1. Fetch the original tender
    const [tender] = await (tx as any)
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

    if (tender.status !== 'captured') {
      throw new ValidationError(`Tender is in status '${tender.status}', expected 'captured'`);
    }

    // 2. Check not already reversed
    const existingReversals = await (tx as any)
      .select()
      .from(tenderReversals)
      .where(
        and(
          eq(tenderReversals.tenantId, ctx.tenantId),
          eq(tenderReversals.originalTenderId, tenderId),
        ),
      );

    if ((existingReversals as any[]).length > 0) {
      throw new ConflictError('Tender has already been reversed');
    }

    // 3. Validate reversal amount
    if (input.amount > tender.amount) {
      throw new ValidationError(
        `Reversal amount (${input.amount}) cannot exceed tender amount (${tender.amount})`,
        [{ field: 'amount', message: `Max reversible amount is ${tender.amount}` }],
      );
    }

    // 4. Create reversal record
    const [reversal] = await (tx as any)
      .insert(tenderReversals)
      .values({
        tenantId: ctx.tenantId,
        locationId: ctx.locationId,
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

    // 5. Generate reversing GL journal entry
    const originalJournals = await (tx as any)
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

    if ((originalJournals as any[]).length > 0) {
      const original = (originalJournals as any[])[0]!;
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
        const adj = reversedEntries.find(
          (e) => e.debit > 0 && e.accountCode.startsWith('4') && e.accountCode !== '4900',
        );
        if (adj) {
          adj.debit += -diff;
        } else {
          reversedEntries.push({
            accountCode: '4999',
            accountName: 'Rounding Adjustment',
            debit: diff < 0 ? -diff : 0,
            credit: diff > 0 ? diff : 0,
          });
        }
      }

      await (tx as any).insert(paymentJournalEntries).values({
        tenantId: ctx.tenantId,
        locationId: ctx.locationId,
        referenceType: 'reversal',
        referenceId: reversal.id,
        orderId: tender.orderId,
        entries: reversedEntries,
        businessDate: tender.businessDate,
        sourceModule: 'payments',
        postingStatus: 'posted',
      });

      // Mark original journal as voided if full reversal
      if (input.amount === tender.amount) {
        await (tx as any)
          .update(paymentJournalEntries)
          .set({ postingStatus: 'voided' })
          .where(eq(paymentJournalEntries.id, original.id));
      }
    }

    // 6. If this was a full reversal, check if order needs status change
    // Recalculate remaining balance
    const { orders } = await import('@oppsera/db');
    const [order] = await (tx as any)
      .select()
      .from(orders)
      .where(eq(orders.id, tender.orderId));

    if (order && order.status === 'paid') {
      // Check if there are still active (non-reversed) tenders covering the total
      const allTenders = await (tx as any)
        .select()
        .from(tenders)
        .where(
          and(
            eq(tenders.tenantId, ctx.tenantId),
            eq(tenders.orderId, tender.orderId),
            eq(tenders.status, 'captured'),
          ),
        );

      const allReversals = await (tx as any)
        .select()
        .from(tenderReversals)
        .where(
          and(
            eq(tenderReversals.tenantId, ctx.tenantId),
            eq(tenderReversals.orderId, tender.orderId),
          ),
        );

      const reversalMap = new Map<string, number>();
      for (const rev of allReversals as any[]) {
        reversalMap.set(
          rev.originalTenderId,
          (reversalMap.get(rev.originalTenderId) || 0) + rev.amount,
        );
      }

      const netTendered = (allTenders as any[]).reduce((sum: number, t: any) => {
        const reversed = reversalMap.get(t.id) || 0;
        return sum + (t.amount as number) - reversed;
      }, 0);

      if (netTendered < order.total) {
        // Order is no longer fully paid — revert to placed
        const now = new Date();
        await (tx as any)
          .update(orders)
          .set({
            status: 'placed',
            paidAt: null,
            updatedBy: ctx.user.id,
            updatedAt: now,
          })
          .where(eq(orders.id, tender.orderId));
      }
    }

    await incrementVersion(tx, tender.orderId);

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

  await auditLog(ctx, 'tender.reversed', 'tender', tenderId);
  return result;
}
