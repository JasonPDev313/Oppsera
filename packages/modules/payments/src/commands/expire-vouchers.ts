import { buildEvent } from '@oppsera/core/events/build-event';
import { db } from '@oppsera/db';
import { vouchers, voucherTypes, voucherLedgerEntries, voucherExpirationIncome } from '@oppsera/db';
import { eq, and, lte, sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { getEventBus } from '@oppsera/core';
import { auditLogSystem } from '@oppsera/core/audit/helpers';
import type { ExpireVouchersInput } from '../voucher-validation';

interface ExpirationResult {
  voucherId: string;
  voucherNumber: string;
  tenantId: string;
  locationId: string | null;
  expirationAmountCents: number;
}

/**
 * Background job: find and expire unredeemed vouchers past their validity end date.
 *
 * For each expired voucher:
 *   1. Set redemptionStatus = 'expired'
 *   2. Create expiration income record
 *   3. Create final ledger entry
 *   4. Emit voucher.expired.v1
 *
 * GL posting is handled asynchronously by the voucher-posting-adapter:
 *   Dr Deferred Revenue Liability
 *   Cr Breakage Income (expiration income)
 *
 * This is meant to be called from a scheduled job, not from an API route.
 * It processes vouchers across ALL tenants.
 */
export async function expireVouchers(
  input: ExpireVouchersInput,
): Promise<{ expiredCount: number; results: ExpirationResult[] }> {
  const batchSize = input.batchSize ?? 100;
  const today = input.businessDate;

  // Find expired vouchers (across all tenants) that haven't been expired yet
  const expiredVouchers = await db
    .select({
      id: vouchers.id,
      tenantId: vouchers.tenantId,
      voucherNumber: vouchers.voucherNumber,
      voucherTypeId: vouchers.voucherTypeId,
      voucherAmountCents: vouchers.voucherAmountCents,
      redeemedAmountCents: vouchers.redeemedAmountCents,
      validityEndDate: vouchers.validityEndDate,
    })
    .from(vouchers)
    .where(
      and(
        lte(vouchers.validityEndDate, today),
        sql`${vouchers.redemptionStatus} != 'expired'`,
        sql`${vouchers.redemptionStatus} != 'fully_redeemed'`,
      ),
    )
    .limit(batchSize);

  const results: ExpirationResult[] = [];
  const bus = getEventBus();

  for (const voucher of expiredVouchers) {
    try {
      const remainingBalanceCents = voucher.voucherAmountCents - voucher.redeemedAmountCents;
      if (remainingBalanceCents <= 0) continue;

      const now = new Date();

      // Fetch voucher type for GL references
      const [vType] = voucher.voucherTypeId
        ? await db
            .select()
            .from(voucherTypes)
            .where(eq(voucherTypes.id, voucher.voucherTypeId))
        : [null];

      // 1. Update voucher status
      await db.update(vouchers).set({
        redemptionStatus: 'expired',
        updatedAt: now,
      }).where(eq(vouchers.id, voucher.id));

      // 2. Create expiration income record
      const expirationId = generateUlid();
      await db.insert(voucherExpirationIncome).values({
        id: expirationId,
        tenantId: voucher.tenantId,
        voucherId: voucher.id,
        voucherNumber: voucher.voucherNumber,
        expirationDate: today,
        expirationAmountCents: remainingBalanceCents,
        createdAt: now,
        updatedAt: now,
      });

      // 3. Create final ledger entry
      const ledgerEntryId = generateUlid();
      await db.insert(voucherLedgerEntries).values({
        id: ledgerEntryId,
        tenantId: voucher.tenantId,
        voucherId: voucher.id,
        description: 'Voucher expired — breakage income',
        balanceCents: 0,
        amountCents: -remainingBalanceCents,
        createdAt: now,
        updatedAt: now,
      });

      // 4. Emit event
      const event = buildEvent({
        eventType: 'voucher.expired.v1',
        tenantId: voucher.tenantId,
        data: {
          voucherId: voucher.id,
          voucherNumber: voucher.voucherNumber,
          expirationAmountCents: remainingBalanceCents,
          expirationDate: today,
          liabilityChartOfAccountId: vType?.liabilityChartOfAccountId ?? null,
          expirationIncomeChartOfAccountId: vType?.expirationIncomeChartOfAccountId ?? null,
        },
      });

      await bus.publish(event);

      await auditLogSystem(
        voucher.tenantId,
        'payment.voucher.expired',
        'voucher',
        voucher.id,
        {
          amountCents: remainingBalanceCents,
          voucherNumber: voucher.voucherNumber,
          expirationDate: today,
        },
      );

      results.push({
        voucherId: voucher.id,
        voucherNumber: voucher.voucherNumber,
        tenantId: voucher.tenantId,
        locationId: null,
        expirationAmountCents: remainingBalanceCents,
      });
    } catch (err) {
      // Log and continue — don't let one failure stop the batch
      console.error(`Failed to expire voucher ${voucher.id}:`, err);
    }
  }

  return { expiredCount: results.length, results };
}
