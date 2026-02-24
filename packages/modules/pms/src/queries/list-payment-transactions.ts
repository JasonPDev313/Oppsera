/**
 * List payment transactions for a folio or reservation.
 */
import { and, eq, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { pmsPaymentTransactions } from '@oppsera/db';

export interface PaymentTransactionItem {
  id: string;
  propertyId: string;
  folioId: string | null;
  reservationId: string | null;
  paymentMethodId: string | null;
  gateway: string;
  gatewayChargeId: string | null;
  gatewayRefundId: string | null;
  transactionType: string;
  amountCents: number;
  currency: string;
  status: string;
  description: string | null;
  failureReason: string | null;
  createdAt: string;
  createdBy: string | null;
}

export async function listPaymentTransactions(
  tenantId: string,
  filters: { folioId?: string; reservationId?: string },
): Promise<PaymentTransactionItem[]> {
  return withTenant(tenantId, async (tx) => {
    const conditions = [eq(pmsPaymentTransactions.tenantId, tenantId)];
    if (filters.folioId) {
      conditions.push(eq(pmsPaymentTransactions.folioId, filters.folioId));
    }
    if (filters.reservationId) {
      conditions.push(eq(pmsPaymentTransactions.reservationId, filters.reservationId));
    }

    const rows = await tx
      .select()
      .from(pmsPaymentTransactions)
      .where(and(...conditions))
      .orderBy(desc(pmsPaymentTransactions.createdAt));

    return rows.map((r) => ({
      id: r.id,
      propertyId: r.propertyId,
      folioId: r.folioId,
      reservationId: r.reservationId,
      paymentMethodId: r.paymentMethodId,
      gateway: r.gateway,
      gatewayChargeId: r.gatewayChargeId,
      gatewayRefundId: r.gatewayRefundId,
      transactionType: r.transactionType,
      amountCents: r.amountCents,
      currency: r.currency,
      status: r.status,
      description: r.description,
      failureReason: r.failureReason,
      createdAt: r.createdAt.toISOString(),
      createdBy: r.createdBy,
    }));
  });
}
