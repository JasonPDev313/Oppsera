import { eq } from 'drizzle-orm';
import { createAdminClient } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import {
  tenantProvisioningRuns,
  tenantProvisioningRunSteps,
} from '../schema';
import { getPublishedVersion } from '../queries/business-type-queries';
import { getRegisteredDomains } from './domain-registry';
import type { ProvisioningContext } from './domain-registry';

/**
 * KNOWN LIMITATION (V1): Non-atomic provisioning.
 *
 * Domain executors run sequentially without a shared transaction. If a
 * critical domain fails mid-run, earlier domains that succeeded are NOT
 * rolled back. The run is marked 'failed' and downstream domains are skipped.
 *
 * Mitigation:
 * - Each executor is idempotent — safe to retry via the retry-step endpoint.
 * - The admin UI surfaces failed/partial runs for manual resolution.
 * - V2 will add compensation handlers (reverse provisioning) per domain.
 */
export async function runProvisioningForTenant(input: {
  tenantId: string;
  businessTypeId: string;
  adminUserId?: string;
}) {
  const db = createAdminClient();

  // 1. Fetch latest published version
  const publishedVersion = await getPublishedVersion(input.businessTypeId);
  if (!publishedVersion) {
    throw new Error('BUSINESS_TYPE_NO_PUBLISHED_VERSION');
  }

  // 2. Create provisioning run record
  const runId = generateUlid();
  const now = new Date();

  // 3. Take snapshot of all domains
  const domains = getRegisteredDomains();
  const snapshotParts: Record<string, unknown> = {};
  for (const domain of domains) {
    snapshotParts[domain.domainKey] = await domain.snapshot(publishedVersion.id);
  }

  await db.insert(tenantProvisioningRuns).values({
    id: runId,
    tenantId: input.tenantId,
    businessTypeId: input.businessTypeId,
    businessTypeVersionId: publishedVersion.id,
    status: 'running',
    snapshotJson: snapshotParts,
    startedAt: now,
    createdBy: input.adminUserId ?? null,
    createdAt: now,
    updatedAt: now,
  });

  const context: ProvisioningContext = {
    tenantId: input.tenantId,
    businessTypeId: input.businessTypeId,
    versionId: publishedVersion.id,
    runId,
    adminUserId: input.adminUserId,
  };

  // 4. Run each domain executor in order
  let hasFailure = false;
  let hasPartial = false;

  for (const domain of domains) {
    const stepId = generateUlid();
    const stepStart = new Date();

    await db.insert(tenantProvisioningRunSteps).values({
      id: stepId,
      provisioningRunId: runId,
      domainKey: domain.domainKey,
      status: 'running',
      startedAt: stepStart,
      createdAt: stepStart,
    });

    try {
      // Validate domain prerequisites before provisioning
      const validation = await domain.validate(context.versionId);
      if (!validation.isValid) {
        await db
          .update(tenantProvisioningRunSteps)
          .set({
            status: 'failed',
            detailsJson: { validationErrors: validation.errors },
            errorMessage: `Validation failed: ${validation.errors.join('; ')}`,
            completedAt: new Date(),
          })
          .where(eq(tenantProvisioningRunSteps.id, stepId));

        if (domain.isCritical) {
          hasFailure = true;
          break;
        } else {
          hasPartial = true;
          continue;
        }
      }

      const result = await domain.provision(context);

      if (result.success) {
        await db
          .update(tenantProvisioningRunSteps)
          .set({
            status: 'success',
            detailsJson: result.details,
            completedAt: new Date(),
          })
          .where(eq(tenantProvisioningRunSteps.id, stepId));
      } else {
        await db
          .update(tenantProvisioningRunSteps)
          .set({
            status: 'failed',
            detailsJson: result.details,
            errorMessage: result.error ?? 'Unknown error',
            completedAt: new Date(),
          })
          .where(eq(tenantProvisioningRunSteps.id, stepId));

        if (domain.isCritical) {
          hasFailure = true;
          break; // Stop on critical domain failure
        } else {
          hasPartial = true;
        }
      }
    } catch (err) {
      await db
        .update(tenantProvisioningRunSteps)
        .set({
          status: 'failed',
          errorMessage: (err as Error).message,
          completedAt: new Date(),
        })
        .where(eq(tenantProvisioningRunSteps.id, stepId));

      if (domain.isCritical) {
        hasFailure = true;
        break;
      } else {
        hasPartial = true;
      }
    }
  }

  // 5. Update run status
  const finalStatus = hasFailure ? 'failed' : hasPartial ? 'partial' : 'success';

  await db
    .update(tenantProvisioningRuns)
    .set({
      status: finalStatus,
      completedAt: new Date(),
      errorSummary: hasFailure ? 'Critical domain provisioning failed' : hasPartial ? 'Some non-critical domains failed' : null,
      updatedAt: new Date(),
    })
    .where(eq(tenantProvisioningRuns.id, runId));

  const [run] = await db
    .select()
    .from(tenantProvisioningRuns)
    .where(eq(tenantProvisioningRuns.id, runId))
    .limit(1);

  return run;
}
