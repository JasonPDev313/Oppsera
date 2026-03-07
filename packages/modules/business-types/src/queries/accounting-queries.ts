import { eq } from 'drizzle-orm';
import { createAdminClient } from '@oppsera/db';
import { businessTypeAccountingTemplates } from '../schema';

export async function getAccountingTemplate(versionId: string) {
  const db = createAdminClient();
  const [row] = await db
    .select()
    .from(businessTypeAccountingTemplates)
    .where(eq(businessTypeAccountingTemplates.businessTypeVersionId, versionId))
    .limit(1);

  return row ?? null;
}
