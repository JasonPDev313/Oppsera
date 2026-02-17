import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError, ValidationError } from '@oppsera/shared';
import { tenders, tenderReversals, paymentJournalEntries } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { AdjustTipInput } from '../validation';
import {
  checkIdempotency,
  saveIdempotencyKey,
} from '@oppsera/module-orders/helpers/idempotency';
import {
  incrementVersion,
} from '@oppsera/module-orders/helpers/optimistic-lock';
import { getDebitAccountForTenderType } from '../helpers/account-mapping';

export async function adjustTip(
  ctx: RequestContext,
  tenderId: string,
  input: AdjustTipInput,
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
      'adjustTip',
    );
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    // 1. Fetch the tender
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

    // 2. Check not reversed
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
      throw new ValidationError('Cannot adjust tip on a reversed tender');
    }

    // 3. Calculate delta
    const previousTipAmount = tender.tipAmount as number;
    const delta = input.newTipAmount - previousTipAmount;

    if (delta === 0) {
      // No change needed — return current state
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'adjustTip', {
        tenderId,
        previousTipAmount,
        newTipAmount: input.newTipAmount,
        delta: 0,
      });
      return { result: { tenderId, previousTipAmount, newTipAmount: input.newTipAmount, delta: 0 }, events: [] };
    }

    // 4. Update tip on tender
    await (tx as any)
      .update(tenders)
      .set({ tipAmount: input.newTipAmount })
      .where(eq(tenders.id, tenderId));

    // 5. Create adjustment GL journal entry for the tip delta
    const debitAccount = getDebitAccountForTenderType(tender.tenderType as string);
    const entries = delta > 0
      ? [
          // Tip increase: debit cash/card, credit tips payable
          { accountCode: debitAccount.code, accountName: debitAccount.name, debit: delta, credit: 0 },
          { accountCode: '2150', accountName: 'Tips Payable', debit: 0, credit: delta },
        ]
      : [
          // Tip decrease: debit tips payable, credit cash/card
          { accountCode: '2150', accountName: 'Tips Payable', debit: -delta, credit: 0 },
          { accountCode: debitAccount.code, accountName: debitAccount.name, debit: 0, credit: -delta },
        ];

    await (tx as any).insert(paymentJournalEntries).values({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId,
      referenceType: 'tender',
      referenceId: tenderId,
      orderId: tender.orderId,
      entries,
      businessDate: tender.businessDate,
      sourceModule: 'payments',
      postingStatus: 'posted',
    });

    await incrementVersion(tx, tender.orderId);

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'adjustTip', {
      tenderId,
      previousTipAmount,
      newTipAmount: input.newTipAmount,
      delta,
    });

    // 6. Build event
    const event = buildEventFromContext(ctx, 'tender.tip_adjusted.v1', {
      tenderId,
      orderId: tender.orderId,
      previousTipAmount,
      newTipAmount: input.newTipAmount,
      delta,
      reason: input.reason ?? null,
    });

    return {
      result: {
        tenderId,
        orderId: tender.orderId,
        previousTipAmount,
        newTipAmount: input.newTipAmount,
        delta,
      },
      events: [event],
    };
  });

  await auditLog(ctx, 'tender.tip_adjusted', 'tender', tenderId);
  return result;
}
