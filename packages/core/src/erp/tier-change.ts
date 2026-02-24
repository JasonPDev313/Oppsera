import { db, withTenant } from '@oppsera/db';
import { tenants, erpWorkflowConfigs, erpWorkflowConfigChangeLog } from '@oppsera/db';
import { eq } from 'drizzle-orm';
import { generateUlid, TIER_WORKFLOW_DEFAULTS, getAllWorkflowKeys } from '@oppsera/shared';
import type { BusinessTier } from '@oppsera/shared';
import type { RequestContext } from '../auth';
import { invalidateWorkflowCache } from './workflow-engine';

/**
 * Apply a tier change to a tenant:
 * 1. Update tenant.business_tier
 * 2. Apply default profiles for workflows that have NO explicit overrides
 * 3. Log all changes
 *
 * Does NOT auto-migrate — only admin-triggered.
 */
export async function applyTierChange(
  ctx: RequestContext,
  tenantId: string,
  newTier: BusinessTier,
  reason: string,
): Promise<{ previousTier: BusinessTier; appliedDefaults: number }> {
  // Fetch current tier
  const [tenant] = await db
    .select({ businessTier: tenants.businessTier })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const previousTier = (tenant?.businessTier as BusinessTier) ?? 'SMB';

  return withTenant(tenantId, async (tx) => {
    // 1. Update tenant row
    await tx
      .update(tenants)
      .set({
        businessTier: newTier,
        tierLastEvaluatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId));

    // 2. Find existing explicit overrides
    const existingConfigs = await tx
      .select({ moduleKey: erpWorkflowConfigs.moduleKey, workflowKey: erpWorkflowConfigs.workflowKey })
      .from(erpWorkflowConfigs)
      .where(eq(erpWorkflowConfigs.tenantId, tenantId));

    const existingKeys = new Set(existingConfigs.map((r) => `${r.moduleKey}.${r.workflowKey}`));

    // 3. Apply defaults for workflows WITHOUT explicit overrides
    const defaults = TIER_WORKFLOW_DEFAULTS[newTier] ?? {};
    const allWorkflows = getAllWorkflowKeys();
    let appliedDefaults = 0;

    for (const { moduleKey, workflowKey } of allWorkflows) {
      const compositeKey = `${moduleKey}.${workflowKey}`;
      if (existingKeys.has(compositeKey)) continue; // Preserve explicit override

      const d = defaults[compositeKey];
      if (!d) continue;

      // No explicit row — the cache fallback will use the new tier defaults.
      // We don't insert rows for default behavior. This keeps the table lean.
      appliedDefaults++;
    }

    // 4. Log the tier change
    await tx.insert(erpWorkflowConfigChangeLog).values({
      id: generateUlid(),
      tenantId,
      moduleKey: '_tier',
      workflowKey: '_tier',
      changedBy: ctx.user?.id ?? 'system',
      changeType: 'tier_change',
      oldConfig: { tier: previousTier } as Record<string, unknown>,
      newConfig: { tier: newTier } as Record<string, unknown>,
      reason,
    });

    invalidateWorkflowCache(tenantId);

    return { previousTier, appliedDefaults };
  });
}
