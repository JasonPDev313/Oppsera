import { eq, asc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { taxRates } from '../schema';

export async function listTaxRates(
  tenantId: string,
): Promise<(typeof taxRates.$inferSelect)[]> {
  return withTenant(tenantId, async (tx) => {
    return tx
      .select()
      .from(taxRates)
      .where(eq(taxRates.tenantId, tenantId))
      .orderBy(asc(taxRates.name));
  });
}
