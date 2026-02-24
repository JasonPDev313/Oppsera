import { withTenant } from '@oppsera/db';
import { customerPaymentMethods } from '@oppsera/db';
import { eq, and, desc } from 'drizzle-orm';

export interface StoredPaymentMethod {
  id: string;
  customerId: string;
  paymentType: string;
  last4: string | null;
  brand: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
  isDefault: boolean;
  nickname: string | null;
  providerProfileId: string | null;
  createdAt: Date;
}

/**
 * List active payment methods for a customer.
 * Returns masked card info (last4, brand, expiry, nickname).
 * Sorted: default first, then by created_at desc.
 */
export async function listPaymentMethods(
  tenantId: string,
  customerId: string,
): Promise<StoredPaymentMethod[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: customerPaymentMethods.id,
        customerId: customerPaymentMethods.customerId,
        paymentType: customerPaymentMethods.paymentType,
        last4: customerPaymentMethods.last4,
        brand: customerPaymentMethods.brand,
        expiryMonth: customerPaymentMethods.expiryMonth,
        expiryYear: customerPaymentMethods.expiryYear,
        isDefault: customerPaymentMethods.isDefault,
        nickname: customerPaymentMethods.nickname,
        providerProfileId: customerPaymentMethods.providerProfileId,
        createdAt: customerPaymentMethods.createdAt,
      })
      .from(customerPaymentMethods)
      .where(
        and(
          eq(customerPaymentMethods.tenantId, tenantId),
          eq(customerPaymentMethods.customerId, customerId),
          eq(customerPaymentMethods.status, 'active'),
        ),
      )
      .orderBy(
        desc(customerPaymentMethods.isDefault),
        desc(customerPaymentMethods.createdAt),
      );

    return rows.map((r) => ({
      id: r.id,
      customerId: r.customerId,
      paymentType: r.paymentType,
      last4: r.last4 ?? null,
      brand: r.brand ?? null,
      expiryMonth: r.expiryMonth ?? null,
      expiryYear: r.expiryYear ?? null,
      isDefault: r.isDefault,
      nickname: r.nickname ?? null,
      providerProfileId: r.providerProfileId ?? null,
      createdAt: r.createdAt,
    }));
  });
}
