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
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';

interface ReverseTenderOptions {
  /**
   * When true, creates the reversal with status 'pending_refund' and defers
   * GL posting + event emission until confirmTenderReversal() is called.
   * Use for card refunds that require a gateway call between DB phases.
   */
  pendingGateway?: boolean;
}

export async function reverseTender(
  ctx: RequestContext,
  tenderId: string,
  input: ReverseTenderInput,
  options?: ReverseTenderOptions,
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

  // Resolve legacy GL setting BEFORE the transaction (same pattern as record-tender / adjust-tip)
  let enableLegacyGl = true;
  try {
    const accountingApi = getAccountingPostingApi();
    const acctSettings = await accountingApi.getSettings(ctx.tenantId);
    enableLegacyGl = acctSettings.enableLegacyGlPosting ?? true;
  } catch {
    // AccountingPostingApi not initialized — legacy behavior
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

    // Count both completed and pending_refund reversals to prevent over-reversal
    const alreadyReversed = existingReversals
      .filter((r) => r.status !== 'refund_failed')
      .reduce((sum, r) => sum + r.amount, 0);

    // 3. Validate reversal amount against remaining reversible amount
    const maxReversible = tender.amount - alreadyReversed;
    if (input.amount > maxReversible) {
      throw new ValidationError(
        `Reversal amount (${input.amount}) exceeds remaining reversible amount (${maxReversible})`,
        [{ field: 'amount', message: `Max reversible amount is ${maxReversible}` }],
      );
    }

    // 4. Create reversal record
    const pendingGateway = options?.pendingGateway ?? false;
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
        status: pendingGateway ? 'pending_refund' : 'completed',
        createdBy: ctx.user.id,
      })
      .returning();

    if (!reversal) throw new AppError('INSERT_FAILED', 'Failed to create reversal record', 500);

    // ── Phase 1 only: pending gateway refund ──────────────────────
    // Record the reversal as pending, mark tender as reversal_pending,
    // but defer GL, event, and order status until confirmTenderReversal().
    if (pendingGateway) {
      await tx
        .update(tenders)
        .set({ status: 'reversal_pending' })
        .where(and(eq(tenders.id, tenderId), eq(tenders.tenantId, ctx.tenantId)));

      await incrementVersion(tx, tender.orderId, ctx.tenantId);

      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'reverseTender', {
        reversalId: reversal.id,
        originalTenderId: tenderId,
        amount: input.amount,
        reversalType: input.reversalType,
        status: 'pending_refund',
      });

      return {
        result: {
          reversalId: reversal.id,
          originalTenderId: tenderId,
          orderId: tender.orderId,
          amount: input.amount,
          reversalType: input.reversalType,
          refundMethod: reversal.refundMethod,
          status: 'pending_refund' as const,
        },
        events: [], // no event until confirmed
      };
    }

    // ── Single-phase completion (non-gateway or best-effort void) ──
    const isFullReversal = (alreadyReversed + input.amount) >= tender.amount;
    await tx
      .update(tenders)
      .set({ status: isFullReversal ? 'reversed' : 'partially_reversed' })
      .where(and(eq(tenders.id, tenderId), eq(tenders.tenantId, ctx.tenantId)));

    // 5. Generate reversing legacy GL journal entry (gated behind enableLegacyGlPosting).
    // When disabled, only the new GL pipeline runs via tender.reversed.v1 event consumer.
    if (enableLegacyGl) {
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
        if (rev.status === 'refund_failed') continue;
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

/**
 * Phase 2a: Confirm a pending gateway refund succeeded.
 *
 * Updates the reversal to 'completed', finalizes tender status,
 * creates GL entries, updates order status, and emits tender.reversed.v1.
 */
export async function confirmTenderReversal(
  ctx: RequestContext,
  reversalId: string,
  providerRef?: string,
) {
  // Resolve legacy GL setting BEFORE the transaction (same pattern as reverseTender)
  let enableLegacyGl = true;
  try {
    const accountingApi = getAccountingPostingApi();
    const acctSettings = await accountingApi.getSettings(ctx.tenantId);
    enableLegacyGl = acctSettings.enableLegacyGlPosting ?? true;
  } catch {
    // AccountingPostingApi not initialized — legacy behavior
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    const [reversal] = await tx
      .select()
      .from(tenderReversals)
      .where(
        and(
          eq(tenderReversals.id, reversalId),
          eq(tenderReversals.tenantId, ctx.tenantId),
        ),
      );

    if (!reversal) {
      throw new AppError('REVERSAL_NOT_FOUND', `Reversal ${reversalId} not found`, 404);
    }

    if (reversal.status !== 'pending_refund') {
      throw new AppError(
        'INVALID_REVERSAL_STATUS',
        `Reversal is '${reversal.status}', expected 'pending_refund'`,
        409,
      );
    }

    // Mark reversal as completed
    await tx
      .update(tenderReversals)
      .set({
        status: 'completed',
        ...(providerRef ? { providerRef } : {}),
      })
      .where(and(eq(tenderReversals.id, reversalId), eq(tenderReversals.tenantId, ctx.tenantId)));

    // Load original tender
    const [tender] = await tx
      .select()
      .from(tenders)
      .where(
        and(
          eq(tenders.id, reversal.originalTenderId),
          eq(tenders.tenantId, ctx.tenantId),
        ),
      );

    if (!tender) {
      throw new AppError('TENDER_NOT_FOUND', `Original tender ${reversal.originalTenderId} not found`, 404);
    }

    // Check cumulative reversals to determine if tender is fully reversed
    const allTenderReversals = await tx
      .select()
      .from(tenderReversals)
      .where(
        and(
          eq(tenderReversals.tenantId, ctx.tenantId),
          eq(tenderReversals.originalTenderId, reversal.originalTenderId),
        ),
      );
    const totalReversed = allTenderReversals
      .filter((r) => r.status !== 'refund_failed')
      .reduce((sum, r) => sum + r.amount, 0);

    const isFullReversal = totalReversed >= tender.amount;
    await tx
      .update(tenders)
      .set({ status: isFullReversal ? 'reversed' : 'partially_reversed' })
      .where(and(eq(tenders.id, tender.id), eq(tenders.tenantId, ctx.tenantId)));

    // Legacy GL journal entry (gated behind enableLegacyGlPosting).
    // When disabled, only the new GL pipeline runs via tender.reversed.v1 event consumer.
    if (enableLegacyGl) {
      const originalJournals = await tx
        .select()
        .from(paymentJournalEntries)
        .where(
          and(
            eq(paymentJournalEntries.tenantId, ctx.tenantId),
            eq(paymentJournalEntries.referenceType, 'tender'),
            eq(paymentJournalEntries.referenceId, tender.id),
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

        const reversalRatio = reversal.amount / tender.amount;
        const reversedEntries = originalEntries.map((e) => ({
          accountCode: e.accountCode,
          accountName: e.accountName,
          debit: Math.round(e.credit * reversalRatio),
          credit: Math.round(e.debit * reversalRatio),
        }));

        const totalDebit = reversedEntries.reduce((s, e) => s + e.debit, 0);
        const totalCredit = reversedEntries.reduce((s, e) => s + e.credit, 0);
        if (totalDebit !== totalCredit) {
          const diff = totalDebit - totalCredit;
          reversedEntries.push({
            accountCode: '4999',
            accountName: 'Rounding Adjustment',
            debit: diff < 0 ? -diff : 0,
            credit: diff > 0 ? diff : 0,
          });
        }

        await tx.insert(paymentJournalEntries).values({
          tenantId: ctx.tenantId,
          locationId: reversal.locationId,
          referenceType: 'reversal',
          referenceId: reversal.id,
          orderId: tender.orderId,
          entries: reversedEntries,
          businessDate: tender.businessDate,
          sourceModule: 'payments',
          postingStatus: 'posted',
        });

        if (reversal.amount === tender.amount) {
          await tx
            .update(paymentJournalEntries)
            .set({ postingStatus: 'voided' })
            .where(and(eq(paymentJournalEntries.id, original.id), eq(paymentJournalEntries.tenantId, ctx.tenantId)));
        }
      }
    }

    // Check if order needs status change
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, tender.orderId), eq(orders.tenantId, ctx.tenantId)));

    if (order && order.status === 'paid') {
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
        if (rev.status === 'refund_failed') continue;
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

    const event = buildEventFromContext(ctx, 'tender.reversed.v1', {
      reversalId: reversal.id,
      originalTenderId: reversal.originalTenderId,
      orderId: tender.orderId,
      amount: reversal.amount,
      reason: reversal.reason,
      reversalType: reversal.reversalType,
      refundMethod: reversal.refundMethod,
    });

    return {
      result: {
        reversalId: reversal.id,
        originalTenderId: reversal.originalTenderId,
        orderId: tender.orderId,
        amount: reversal.amount,
        reversalType: reversal.reversalType,
        refundMethod: reversal.refundMethod,
      },
      events: [event],
    };
  });

  auditLogDeferred(ctx, 'tender.reversed', 'tender', reversalId);
  return result;
}

/**
 * Phase 2b: Mark a pending gateway refund as failed.
 *
 * Restores the tender to its previous status and marks the reversal as 'refund_failed'.
 * The failed reversal record is preserved for audit/reconciliation.
 */
export async function failTenderReversal(
  ctx: RequestContext,
  reversalId: string,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [reversal] = await tx
      .select()
      .from(tenderReversals)
      .where(
        and(
          eq(tenderReversals.id, reversalId),
          eq(tenderReversals.tenantId, ctx.tenantId),
        ),
      );

    if (!reversal) {
      throw new AppError('REVERSAL_NOT_FOUND', `Reversal ${reversalId} not found`, 404);
    }

    if (reversal.status !== 'pending_refund') {
      throw new AppError(
        'INVALID_REVERSAL_STATUS',
        `Reversal is '${reversal.status}', expected 'pending_refund'`,
        409,
      );
    }

    // Mark reversal as failed
    await tx
      .update(tenderReversals)
      .set({ status: 'refund_failed' })
      .where(and(eq(tenderReversals.id, reversalId), eq(tenderReversals.tenantId, ctx.tenantId)));

    // Restore tender status — check if there are other completed reversals
    const otherReversals = await tx
      .select()
      .from(tenderReversals)
      .where(
        and(
          eq(tenderReversals.tenantId, ctx.tenantId),
          eq(tenderReversals.originalTenderId, reversal.originalTenderId),
        ),
      );

    const hasCompletedReversals = otherReversals.some(
      (r) => r.id !== reversalId && r.status === 'completed',
    );

    await tx
      .update(tenders)
      .set({ status: hasCompletedReversals ? 'partially_reversed' : 'captured' })
      .where(
        and(
          eq(tenders.id, reversal.originalTenderId),
          eq(tenders.tenantId, ctx.tenantId),
        ),
      );

    await incrementVersion(tx, reversal.orderId, ctx.tenantId);

    return {
      result: {
        reversalId: reversal.id,
        originalTenderId: reversal.originalTenderId,
        orderId: reversal.orderId,
        status: 'refund_failed' as const,
      },
      events: [],
    };
  });

  auditLogDeferred(ctx, 'tender.reversal_failed', 'tender', reversalId);
  return result;
}
