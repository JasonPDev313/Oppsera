import { eq, and, inArray } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { fixedAssets, glAccounts } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import { ACCOUNTING_EVENTS } from '../events/types';

export interface CreateFixedAssetInput {
  name: string;
  assetNumber: string;
  category: 'building' | 'equipment' | 'vehicle' | 'furniture' | 'technology' | 'leasehold_improvement' | 'other';
  acquisitionDate: string;
  acquisitionCost: string;
  salvageValue: string;
  usefulLifeMonths: number;
  depreciationMethod: 'straight_line' | 'declining_balance' | 'sum_of_years';
  description?: string;
  locationId?: string;
  assetGlAccountId?: string;
  depreciationExpenseAccountId?: string;
  accumulatedDepreciationAccountId?: string;
  disposalGlAccountId?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export async function createFixedAsset(ctx: RequestContext, input: CreateFixedAssetInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate unique asset number within tenant
    const [existing] = await tx
      .select({ id: fixedAssets.id })
      .from(fixedAssets)
      .where(
        and(
          eq(fixedAssets.tenantId, ctx.tenantId),
          eq(fixedAssets.assetNumber, input.assetNumber),
        ),
      )
      .limit(1);

    if (existing) {
      throw new Error(`Asset number "${input.assetNumber}" already exists`);
    }

    // Validate GL account IDs belong to this tenant
    const glAccountIds = [
      input.assetGlAccountId,
      input.depreciationExpenseAccountId,
      input.accumulatedDepreciationAccountId,
      input.disposalGlAccountId,
    ].filter((id): id is string => !!id);

    if (glAccountIds.length > 0) {
      const ownedAccounts = await tx
        .select({ id: glAccounts.id })
        .from(glAccounts)
        .where(
          and(
            eq(glAccounts.tenantId, ctx.tenantId),
            inArray(glAccounts.id, glAccountIds),
          ),
        );
      const ownedIds = new Set(ownedAccounts.map((a) => a.id));
      for (const accountId of glAccountIds) {
        if (!ownedIds.has(accountId)) {
          throw new Error(`GL account "${accountId}" not found or does not belong to this tenant`);
        }
      }
    }

    const id = generateUlid();
    const [created] = await tx
      .insert(fixedAssets)
      .values({
        id,
        tenantId: ctx.tenantId,
        locationId: input.locationId ?? null,
        assetNumber: input.assetNumber,
        name: input.name,
        description: input.description ?? null,
        category: input.category,
        status: 'active',
        acquisitionDate: input.acquisitionDate,
        acquisitionCost: input.acquisitionCost,
        salvageValue: input.salvageValue,
        usefulLifeMonths: input.usefulLifeMonths,
        depreciationMethod: input.depreciationMethod,
        assetGlAccountId: input.assetGlAccountId ?? null,
        depreciationExpenseAccountId: input.depreciationExpenseAccountId ?? null,
        accumulatedDepreciationAccountId: input.accumulatedDepreciationAccountId ?? null,
        disposalGlAccountId: input.disposalGlAccountId ?? null,
        notes: input.notes ?? null,
        metadata: input.metadata ?? {},
        createdBy: ctx.user.id,
      })
      .returning();

    const event = buildEventFromContext(ctx, ACCOUNTING_EVENTS.FIXED_ASSET_CREATED, {
      assetId: id,
      assetNumber: input.assetNumber,
      name: input.name,
      category: input.category,
      acquisitionCost: input.acquisitionCost,
      depreciationMethod: input.depreciationMethod,
    });

    return { result: created!, events: [event] };
  });

  auditLogDeferred(ctx, 'accounting.fixed_asset.created', 'fixed_asset', result.id);
  return result;
}
