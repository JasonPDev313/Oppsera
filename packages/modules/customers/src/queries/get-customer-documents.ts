import { eq, and, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { customerDocuments } from '@oppsera/db';

export interface GetCustomerDocumentsInput {
  tenantId: string;
  customerId: string;
}

export async function getCustomerDocuments(
  input: GetCustomerDocumentsInput,
): Promise<(typeof customerDocuments.$inferSelect)[]> {
  return withTenant(input.tenantId, async (tx) => {
    const documents = await tx
      .select()
      .from(customerDocuments)
      .where(
        and(
          eq(customerDocuments.tenantId, input.tenantId),
          eq(customerDocuments.customerId, input.customerId),
        ),
      )
      .orderBy(desc(customerDocuments.uploadedAt));

    return documents;
  });
}
