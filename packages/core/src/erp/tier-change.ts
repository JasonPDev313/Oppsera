import { db, withTenant, sql } from '@oppsera/db';
import { tenants, erpWorkflowConfigs, erpWorkflowConfigChangeLog, tenantSubscriptions, pricingPlans, subscriptionChangeLog } from '@oppsera/db';
import { eq } from 'drizzle-orm';
import { generateUlid, TIER_WORKFLOW_DEFAULTS, getAllWorkflowKeys, TIER_SEAT_LIMITS, computeMonthlyTotal, classifyTierChange } from '@oppsera/shared';
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

    // 4. Sync subscription to new tier (if subscription exists)
    const [existingSub] = await tx
      .select({ id: tenantSubscriptions.id, pricingPlanId: tenantSubscriptions.pricingPlanId, seatCount: tenantSubscriptions.seatCount })
      .from(tenantSubscriptions)
      .where(eq(tenantSubscriptions.tenantId, tenantId))
      .limit(1);

    if (existingSub) {
      // Find the pricing plan that matches the new tier
      const [matchingPlan] = await tx
        .select()
        .from(pricingPlans)
        .where(eq(pricingPlans.tier, newTier))
        .limit(1);

      if (matchingPlan && matchingPlan.id !== existingSub.pricingPlanId) {
        const newMonthly = computeMonthlyTotal(
          existingSub.seatCount,
          matchingPlan.pricePerSeatCents,
          matchingPlan.baseFeeCents,
          0,
        );

        await tx
          .update(tenantSubscriptions)
          .set({
            pricingPlanId: matchingPlan.id,
            monthlyTotalCents: newMonthly,
            updatedAt: new Date(),
          })
          .where(eq(tenantSubscriptions.tenantId, tenantId));

        // Log subscription change
        await tx.insert(subscriptionChangeLog).values({
          id: generateUlid(),
          tenantId,
          changedBy: ctx.user?.id ?? 'system',
          changeType: classifyTierChange(previousTier, newTier) === 'upgrade' ? 'tier_upgrade' : 'tier_downgrade',
          previousState: { planId: existingSub.pricingPlanId, tier: previousTier } as Record<string, unknown>,
          newState: { planId: matchingPlan.id, tier: newTier, monthlyTotalCents: newMonthly } as Record<string, unknown>,
          reason,
        });
      }
    }

    // 5. Update entitlements.limits.max_seats
    const maxSeats = TIER_SEAT_LIMITS[newTier];
    if (maxSeats) {
      await tx.execute(sql`
        UPDATE entitlements
        SET limits = jsonb_set(COALESCE(limits, '{}'::jsonb), '{max_seats}', ${String(maxSeats)}::jsonb),
            updated_at = now()
        WHERE tenant_id = ${tenantId} AND module_key = 'platform_core'
      `);
    } else {
      // Unlimited — remove the max_seats key
      await tx.execute(sql`
        UPDATE entitlements
        SET limits = COALESCE(limits, '{}'::jsonb) - 'max_seats',
            updated_at = now()
        WHERE tenant_id = ${tenantId} AND module_key = 'platform_core'
      `);
    }

    // 6. Log the tier change
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
