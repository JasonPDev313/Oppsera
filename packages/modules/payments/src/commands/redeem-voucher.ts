import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError, ValidationError, generateUlid } from '@oppsera/shared';
import { vouchers, voucherTypes, voucherLedgerEntries } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { RedeemVoucherInput } from '../voucher-validation';
import {
  checkIdempotency,
  saveIdempotencyKey,
} from '@oppsera/core/helpers/idempotency';

/**
 * Redeem (partially or fully) a voucher balance.
 *
 * Reduces the voucher balance, creates a ledger entry,
 * and emits voucher.redeemed.v1.
 *
 * GL posting is handled asynchronously by the voucher-posting-adapter:
 *   Dr Deferred Revenue Liability
 *   Cr Revenue
 */
export async function redeemVoucher(
  ctx: RequestContext,
  input: RedeemVoucherInput,
) {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx,
      ctx.tenantId,
      input.clientRequestId,
      'redeemVoucher',
    );
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    // 1. Fetch voucher
    const [voucher] = await (tx as any)
      .select()
      .from(vouchers)
      .where(
        and(
          eq(vouchers.tenantId, ctx.tenantId),
          eq(vouchers.id, input.voucherId),
        ),
      );

    if (!voucher) {
      throw new AppError('VOUCHER_NOT_FOUND', `Voucher ${input.voucherId} not found`, 404);
    }

    // 2. Check voucher is redeemable
    if (voucher.redemptionStatus === 'fully_redeemed') {
      throw new ValidationError('Voucher is fully redeemed');
    }
    if (voucher.redemptionStatus === 'expired') {
      throw new ValidationError('Voucher has expired');
    }

    // 3. Check validity dates
    const today = input.businessDate;
    if (voucher.validityStartDate && today < voucher.validityStartDate) {
      throw new ValidationError('Voucher is not yet valid');
    }
    if (voucher.validityEndDate && today > voucher.validityEndDate) {
      throw new ValidationError('Voucher has expired');
    }

    // 4. Check remaining balance
    const remainingBalanceCents = voucher.voucherAmountCents - voucher.redeemedAmountCents;
    if (input.amountCents > remainingBalanceCents) {
      throw new ValidationError(
        `Redemption amount ${input.amountCents} exceeds remaining balance ${remainingBalanceCents}`,
        [{ field: 'amountCents', message: `Max redeemable is ${remainingBalanceCents} cents` }],
      );
    }

    // 5. Update voucher
    const newRedeemedAmount = voucher.redeemedAmountCents + input.amountCents;
    const newRemainingBalance = voucher.voucherAmountCents - newRedeemedAmount;
    const newStatus = newRemainingBalance <= 0 ? 'fully_redeemed' : 'partially_redeemed';
    const now = new Date();

    await (tx as any).update(vouchers).set({
      redeemedAmountCents: newRedeemedAmount,
      redemptionStatus: newStatus,
      updatedAt: now,
    }).where(eq(vouchers.id, input.voucherId));

    // 6. Create ledger entry (redemption = negative amount)
    const ledgerEntryId = generateUlid();
    await (tx as any).insert(voucherLedgerEntries).values({
      id: ledgerEntryId,
      tenantId: ctx.tenantId,
      voucherId: input.voucherId,
      tenderId: input.tenderId ?? null,
      description: 'Voucher redeemed',
      balanceCents: newRemainingBalance,
      amountCents: -input.amountCents,
      createdAt: now,
      updatedAt: now,
    });

    // 7. Fetch voucher type for GL account references
    const [vType] = voucher.voucherTypeId
      ? await (tx as any)
          .select()
          .from(voucherTypes)
          .where(eq(voucherTypes.id, voucher.voucherTypeId))
      : [null];

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'redeemVoucher', {
      voucherId: input.voucherId,
      amountCents: input.amountCents,
      newBalanceCents: newRemainingBalance,
    });

    // 8. Emit event
    const event = buildEventFromContext(ctx, 'voucher.redeemed.v1', {
      voucherId: input.voucherId,
      voucherNumber: voucher.voucherNumber,
      amountCents: input.amountCents,
      remainingBalanceCents: newRemainingBalance,
      locationId: ctx.locationId,
      businessDate: input.businessDate,
      orderId: input.orderId ?? null,
      tenderId: input.tenderId ?? null,
      liabilityChartOfAccountId: vType?.liabilityChartOfAccountId ?? null,
    });

    return {
      result: {
        voucherId: input.voucherId,
        redeemedAmountCents: input.amountCents,
        remainingBalanceCents: newRemainingBalance,
        redemptionStatus: newStatus,
      },
      events: [event],
    };
  });

  await auditLog(ctx, 'voucher.redeemed', 'voucher', input.voucherId);
  return result;
}
