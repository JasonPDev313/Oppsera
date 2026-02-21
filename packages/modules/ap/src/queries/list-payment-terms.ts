import { eq, and, desc } from 'drizzle-orm';
import { withTenant, paymentTerms } from '@oppsera/db';

export interface ListPaymentTermsInput {
  tenantId: string;
  isActive?: boolean;
}

export interface PaymentTermItem {
  id: string;
  tenantId: string;
  name: string;
  days: number;
  discountDays: number | null;
  discountPercent: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function listPaymentTerms(
  input: ListPaymentTermsInput,
): Promise<PaymentTermItem[]> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions = [eq(paymentTerms.tenantId, input.tenantId)];

    // Default to active only unless explicitly set to false
    if (input.isActive !== false) {
      conditions.push(eq(paymentTerms.isActive, true));
    }

    const rows = await tx
      .select()
      .from(paymentTerms)
      .where(and(...conditions))
      .orderBy(desc(paymentTerms.createdAt));

    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      days: row.days,
      discountDays: row.discountDays ?? null,
      discountPercent: row.discountPercent ? Number(row.discountPercent) : null,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  });
}
