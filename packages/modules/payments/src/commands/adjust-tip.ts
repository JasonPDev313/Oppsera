import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError, ValidationError } from '@oppsera/shared';
import { tenders, tenderReversals, paymentJournalEntries, paymentIntents } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { AdjustTipInput } from '../validation';
import {
  checkIdempotency,
  saveIdempotencyKey,
} from '@oppsera/core/helpers/idempotency';
import {
  incrementVersion,
} from '@oppsera/core/helpers/optimistic-lock';
import { getDebitAccountForTenderType } from '../helpers/account-mapping';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';

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

  // Resolve legacy GL setting BEFORE the transaction (same pattern as record-tender)
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
      'adjustTip',
    );
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] }; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON from DB

    // 1. Fetch the tender
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

    if (tender.status !== 'captured') {
      throw new ValidationError(`Tender is in status '${tender.status}', expected 'captured'`);
    }

    // 2. Check not reversed
    const existingReversals = await tx
      .select()
      .from(tenderReversals)
      .where(
        and(
          eq(tenderReversals.tenantId, ctx.tenantId),
          eq(tenderReversals.originalTenderId, tenderId),
        ),
      );

    if (existingReversals.length > 0) {
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
    await tx
      .update(tenders)
      .set({ tipAmount: input.newTipAmount })
      .where(and(eq(tenders.id, tenderId), eq(tenders.tenantId, ctx.tenantId)));

    // Bug 2 fix: keep the linked payment intent's amountCents in sync with the new tip total.
    // At sale time, amountCents = baseAmount + tipCents (baked in). When the tip is adjusted
    // the payment intent must reflect the new total so that ACH NACHA reversal amount checks
    // (which compare refundAmountCents against intent.amountCents) remain correct.
    if (tender.paymentIntentId) {
      await tx
        .update(paymentIntents)
        .set({
          amountCents: tender.amount + input.newTipAmount,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(paymentIntents.id, tender.paymentIntentId),
            eq(paymentIntents.tenantId, ctx.tenantId),
          ),
        );
    }

    // 5. Create legacy GL journal entry for the tip delta (gated behind enableLegacyGlPosting).
    // When disabled, only the new GL pipeline runs via tender.tip_adjusted.v1 event consumer.
    if (enableLegacyGl) {
      const debitAccount = getDebitAccountForTenderType(tender.tenderType);
      const entries = delta > 0
        ? [
            // Tip increase: debit cash/card, credit tips payable
            { accountCode: debitAccount.code, accountName: debitAccount.name, debit: delta, credit: 0 },
            { accountCode: '2160', accountName: 'Tips Payable', debit: 0, credit: delta },
          ]
        : [
            // Tip decrease: debit tips payable, credit cash/card
            { accountCode: '2160', accountName: 'Tips Payable', debit: -delta, credit: 0 },
            { accountCode: debitAccount.code, accountName: debitAccount.name, debit: 0, credit: -delta },
          ];

      await tx.insert(paymentJournalEntries).values({
        tenantId: ctx.tenantId,
        locationId: ctx.locationId!,
        referenceType: 'tender',
        referenceId: tenderId,
        orderId: tender.orderId,
        entries,
        businessDate: tender.businessDate,
        sourceModule: 'payments',
        postingStatus: 'posted',
      });
    }

    await incrementVersion(tx, tender.orderId, ctx.tenantId);

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
      businessDate: tender.businessDate,
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

  auditLogDeferred(ctx, 'tender.tip_adjusted', 'tender', tenderId);
  return result;
}
