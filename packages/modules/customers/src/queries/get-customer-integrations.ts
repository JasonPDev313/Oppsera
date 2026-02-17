import { eq, and } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import {
  customerExternalIds,
  customerAuthAccounts,
} from '@oppsera/db';

export interface GetCustomerIntegrationsInput {
  tenantId: string;
  customerId: string;
}

export interface GetCustomerIntegrationsResult {
  externalIds: (typeof customerExternalIds.$inferSelect)[];
  authAccounts: (typeof customerAuthAccounts.$inferSelect)[];
}

export async function getCustomerIntegrations(
  input: GetCustomerIntegrationsInput,
): Promise<GetCustomerIntegrationsResult> {
  return withTenant(input.tenantId, async (tx) => {
    const externalIds = await tx
      .select()
      .from(customerExternalIds)
      .where(
        and(
          eq(customerExternalIds.tenantId, input.tenantId),
          eq(customerExternalIds.customerId, input.customerId),
        ),
      );

    const authAccounts = await tx
      .select()
      .from(customerAuthAccounts)
      .where(
        and(
          eq(customerAuthAccounts.tenantId, input.tenantId),
          eq(customerAuthAccounts.customerId, input.customerId),
        ),
      );

    return { externalIds, authAccounts };
  });
}
