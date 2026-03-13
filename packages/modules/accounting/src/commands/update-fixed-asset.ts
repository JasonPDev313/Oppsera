import { eq, and, inArray } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { fixedAssets, glAccounts } from '@oppsera/db';
import { ACCOUNTING_EVENTS } from '../events/types';

export interface UpdateFixedAssetInput {
  assetId: string;
  name?: string;
  description?: string | null;
  category?: 'building' | 'equipment' | 'vehicle' | 'furniture' | 'technology' | 'leasehold_improvement' | 'other';
  locationId?: string | null;
  assetGlAccountId?: string | null;
  depreciationExpenseAccountId?: string | null;
  accumulatedDepreciationAccountId?: string | null;
  disposalGlAccountId?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

export async function updateFixedAsset(ctx: RequestContext, input: UpdateFixedAssetInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(fixedAssets)
      .where(
        and(
          eq(fixedAssets.id, input.assetId),
          eq(fixedAssets.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new Error('Fixed asset not found');
    }

    if (existing.status !== 'active') {
      throw new Error(`Cannot update a fixed asset with status "${existing.status}". Only active assets can be updated.`);
    }

    // Validate GL account IDs belong to this tenant
    const glAccountIds = [
      input.assetGlAccountId,
      input.depreciationExpenseAccountId,
      input.accumulatedDepreciationAccountId,
      input.disposalGlAccountId,
    ].filter((id): id is string => !!id && id !== '');

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

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.category !== undefined) updates.category = input.category;
    if (input.locationId !== undefined) updates.locationId = input.locationId;
    if (input.assetGlAccountId !== undefined) updates.assetGlAccountId = input.assetGlAccountId;
    if (input.depreciationExpenseAccountId !== undefined) updates.depreciationExpenseAccountId = input.depreciationExpenseAccountId;
    if (input.accumulatedDepreciationAccountId !== undefined) updates.accumulatedDepreciationAccountId = input.accumulatedDepreciationAccountId;
    if (input.disposalGlAccountId !== undefined) updates.disposalGlAccountId = input.disposalGlAccountId;
    if (input.notes !== undefined) updates.notes = input.notes;
    if (input.metadata !== undefined) updates.metadata = input.metadata;

    const [updated] = await tx
      .update(fixedAssets)
      .set(updates)
      .where(and(eq(fixedAssets.id, input.assetId), eq(fixedAssets.tenantId, ctx.tenantId)))
      .returning();

    const event = buildEventFromContext(ctx, ACCOUNTING_EVENTS.FIXED_ASSET_UPDATED, {
      assetId: input.assetId,
    });

    return { result: updated!, events: [event] };
  });

  auditLogDeferred(ctx, 'accounting.fixed_asset.updated', 'fixed_asset', result.id);
  return result;
}
