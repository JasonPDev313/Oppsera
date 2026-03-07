import { eq, desc } from 'drizzle-orm';
import { createAdminClient } from '@oppsera/db';
import { tenantProvisioningRuns, tenantProvisioningRunSteps } from '../schema';

export async function getProvisioningRun(id: string) {
  const db = createAdminClient();
  const [row] = await db
    .select()
    .from(tenantProvisioningRuns)
    .where(eq(tenantProvisioningRuns.id, id))
    .limit(1);

  return row ?? null;
}

export async function listProvisioningRunsForTenant(tenantId: string) {
  const db = createAdminClient();
  const rows = await db
    .select()
    .from(tenantProvisioningRuns)
    .where(eq(tenantProvisioningRuns.tenantId, tenantId))
    .orderBy(desc(tenantProvisioningRuns.createdAt))
    .limit(50);

  return rows;
}

export async function listProvisioningRunsForBusinessType(businessTypeId: string) {
  const db = createAdminClient();
  const rows = await db
    .select()
    .from(tenantProvisioningRuns)
    .where(eq(tenantProvisioningRuns.businessTypeId, businessTypeId))
    .orderBy(desc(tenantProvisioningRuns.createdAt))
    .limit(50);

  return rows;
}

export async function listProvisioningRunSteps(runId: string) {
  const db = createAdminClient();
  const rows = await db
    .select()
    .from(tenantProvisioningRunSteps)
    .where(eq(tenantProvisioningRunSteps.provisioningRunId, runId))
    .orderBy(tenantProvisioningRunSteps.createdAt);

  return rows;
}
