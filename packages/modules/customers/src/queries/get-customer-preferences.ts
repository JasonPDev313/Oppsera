import { eq, and, asc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { customerPreferences } from '@oppsera/db';

export interface GetCustomerPrefsInput {
  tenantId: string;
  customerId: string;
}

export type CustomerPrefsResult = Record<string, (typeof customerPreferences.$inferSelect)[]>;

export async function getCustomerPreferences(
  input: GetCustomerPrefsInput,
): Promise<CustomerPrefsResult> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(customerPreferences)
      .where(
        and(
          eq(customerPreferences.tenantId, input.tenantId),
          eq(customerPreferences.customerId, input.customerId),
        ),
      )
      .orderBy(asc(customerPreferences.category), asc(customerPreferences.key));

    const grouped: CustomerPrefsResult = {};
    for (const row of rows) {
      const existing = grouped[row.category] ?? [];
      existing.push(row);
      grouped[row.category] = existing;
    }

    return grouped;
  });
}
