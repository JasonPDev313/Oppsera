import { eq } from 'drizzle-orm';
import { createAdminClient } from '@oppsera/db';
import { businessTypeModuleDefaults } from '../schema';

export async function getModuleDefaults(versionId: string) {
  const db = createAdminClient();
  const rows = await db
    .select()
    .from(businessTypeModuleDefaults)
    .where(eq(businessTypeModuleDefaults.businessTypeVersionId, versionId))
    .orderBy(businessTypeModuleDefaults.sortOrder);

  return rows;
}
