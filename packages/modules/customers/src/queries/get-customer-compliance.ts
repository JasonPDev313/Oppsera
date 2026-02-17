import { eq, and } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { customerConsents } from '@oppsera/db';

export interface GetCustomerComplianceInput {
  tenantId: string;
  customerId: string;
}

export async function getCustomerCompliance(
  input: GetCustomerComplianceInput,
): Promise<(typeof customerConsents.$inferSelect)[]> {
  return withTenant(input.tenantId, async (tx) => {
    const consents = await tx
      .select()
      .from(customerConsents)
      .where(
        and(
          eq(customerConsents.tenantId, input.tenantId),
          eq(customerConsents.customerId, input.customerId),
        ),
      );

    return consents;
  });
}
