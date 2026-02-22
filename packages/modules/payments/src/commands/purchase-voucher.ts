import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError, generateUlid } from '@oppsera/shared';
import { vouchers, voucherTypes, voucherLedgerEntries, voucherDeposits } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { PurchaseVoucherInput } from '../voucher-validation';
import {
  checkIdempotency,
  saveIdempotencyKey,
} from '@oppsera/core/helpers/idempotency';

/**
 * Purchase a new voucher (gift card).
 *
 * Creates the voucher record, initial ledger entry (full balance),
 * deposit record, and emits voucher.purchased.v1.
 *
 * GL posting is handled asynchronously by the voucher-posting-adapter:
 *   Dr Cash/Payment account
 *   Cr Deferred Revenue Liability
 */
export async function purchaseVoucher(
  ctx: RequestContext,
  input: PurchaseVoucherInput,
) {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx,
      ctx.tenantId,
      input.clientRequestId,
      'purchaseVoucher',
    );
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    // 1. Validate voucher type exists
    const [vType] = await (tx as any)
      .select()
      .from(voucherTypes)
      .where(
        and(
          eq(voucherTypes.tenantId, ctx.tenantId),
          eq(voucherTypes.id, input.voucherTypeId),
        ),
      );

    if (!vType) {
      throw new AppError('VOUCHER_TYPE_NOT_FOUND', `Voucher type ${input.voucherTypeId} not found`, 404);
    }

    // 2. Generate voucher number if not provided
    const voucherNumber = input.voucherNumber ?? generateUlid().slice(-10).toUpperCase();

    // 3. Create voucher
    const voucherId = generateUlid();
    const now = new Date();

    await (tx as any).insert(vouchers).values({
      id: voucherId,
      tenantId: ctx.tenantId,
      voucherTypeId: input.voucherTypeId,
      voucherNumber,
      voucherAmountCents: input.amountCents,
      redeemedAmountCents: 0,
      redemptionStatus: 'unredeemed',
      customerId: input.customerId ?? null,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      notes: input.notes ?? null,
      orderId: input.orderId ?? null,
      taxCents: 0,
      totalCents: input.amountCents,
      createdAt: now,
      updatedAt: now,
    });

    // 4. Create initial ledger entry (purchase = positive balance)
    const ledgerEntryId = generateUlid();
    await (tx as any).insert(voucherLedgerEntries).values({
      id: ledgerEntryId,
      tenantId: ctx.tenantId,
      voucherId,
      description: 'Voucher purchased',
      balanceCents: input.amountCents,
      amountCents: input.amountCents,
      createdAt: now,
      updatedAt: now,
    });

    // 5. Create deposit record
    const depositId = generateUlid();
    await (tx as any).insert(voucherDeposits).values({
      id: depositId,
      tenantId: ctx.tenantId,
      voucherId,
      orderId: input.orderId ?? null,
      paymentAmountCents: input.amountCents,
      depositAmountCents: input.amountCents,
      discountCents: 0,
      createdAt: now,
      updatedAt: now,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'purchaseVoucher', {
      voucherId,
      voucherNumber,
    });

    // 6. Emit event
    const event = buildEventFromContext(ctx, 'voucher.purchased.v1', {
      voucherId,
      voucherNumber,
      voucherTypeId: input.voucherTypeId,
      amountCents: input.amountCents,
      locationId: ctx.locationId,
      businessDate: input.businessDate,
      customerId: input.customerId ?? null,
      paymentMethod: input.paymentMethod ?? 'cash',
      liabilityChartOfAccountId: vType.liabilityChartOfAccountId ?? null,
    });

    return {
      result: {
        voucherId,
        voucherNumber,
        voucherTypeId: input.voucherTypeId,
        amountCents: input.amountCents,
        balanceCents: input.amountCents,
        redemptionStatus: 'unredeemed',
      },
      events: [event],
    };
  });

  await auditLog(ctx, 'voucher.purchased', 'voucher', result.voucherId);
  return result;
}
