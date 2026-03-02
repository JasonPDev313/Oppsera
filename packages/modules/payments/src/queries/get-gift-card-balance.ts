import { eq, and } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { vouchers } from '@oppsera/db';

export interface GiftCardBalanceResult {
  id: string;
  voucherNumber: string;
  balanceCents: number;
  totalAmountCents: number;
  redeemedAmountCents: number;
  status: string;
}

/**
 * Look up a gift card / voucher balance by card number (voucherNumber).
 * Returns null if not found or fully redeemed / expired.
 */
export async function getGiftCardBalance(
  tenantId: string,
  cardNumber: string,
): Promise<GiftCardBalanceResult | null> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: vouchers.id,
        voucherNumber: vouchers.voucherNumber,
        voucherAmountCents: vouchers.voucherAmountCents,
        redeemedAmountCents: vouchers.redeemedAmountCents,
        redemptionStatus: vouchers.redemptionStatus,
      })
      .from(vouchers)
      .where(
        and(
          eq(vouchers.tenantId, tenantId),
          eq(vouchers.voucherNumber, cardNumber),
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    // Skip fully consumed or expired cards
    if (row.redemptionStatus === 'fully_redeemed' || row.redemptionStatus === 'expired') {
      return {
        id: row.id,
        voucherNumber: row.voucherNumber,
        balanceCents: 0,
        totalAmountCents: row.voucherAmountCents,
        redeemedAmountCents: row.redeemedAmountCents,
        status: row.redemptionStatus,
      };
    }

    return {
      id: row.id,
      voucherNumber: row.voucherNumber,
      balanceCents: row.voucherAmountCents - row.redeemedAmountCents,
      totalAmountCents: row.voucherAmountCents,
      redeemedAmountCents: row.redeemedAmountCents,
      status: row.redemptionStatus,
    };
  });
}
