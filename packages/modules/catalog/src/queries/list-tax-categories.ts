import { eq, and, asc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { taxCategories } from '../schema';

export async function listTaxCategories(
  tenantId: string,
  includeInactive = false,
): Promise<(typeof taxCategories.$inferSelect)[]> {
  return withTenant(tenantId, async (tx) => {
    const conditions = [eq(taxCategories.tenantId, tenantId)];
    if (!includeInactive) {
      conditions.push(eq(taxCategories.isActive, true));
    }

    return tx
      .select()
      .from(taxCategories)
      .where(and(...conditions))
      .orderBy(asc(taxCategories.name));
  });
}
