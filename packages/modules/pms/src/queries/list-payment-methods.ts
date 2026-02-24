/**
 * List payment methods for a guest.
 */
import { and, eq, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { pmsPaymentMethods } from '@oppsera/db';

export interface PaymentMethodItem {
  id: string;
  guestId: string;
  gateway: string;
  cardLastFour: string | null;
  cardBrand: string | null;
  cardExpMonth: number | null;
  cardExpYear: number | null;
  isDefault: boolean;
  createdAt: string;
}

export async function listPaymentMethods(
  tenantId: string,
  guestId: string,
): Promise<PaymentMethodItem[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(pmsPaymentMethods)
      .where(
        and(
          eq(pmsPaymentMethods.tenantId, tenantId),
          eq(pmsPaymentMethods.guestId, guestId),
        ),
      )
      .orderBy(desc(pmsPaymentMethods.createdAt));

    return rows.map((r) => ({
      id: r.id,
      guestId: r.guestId,
      gateway: r.gateway,
      cardLastFour: r.cardLastFour,
      cardBrand: r.cardBrand,
      cardExpMonth: r.cardExpMonth,
      cardExpYear: r.cardExpYear,
      isDefault: r.isDefault,
      createdAt: r.createdAt.toISOString(),
    }));
  });
}
