import { eq, and, inArray } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { glAccounts, subDepartmentGlDefaults } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';
import type { SaveSubDepartmentDefaultsInput } from '../validation';
import { tryAutoRemap } from '../helpers/try-auto-remap';

export async function saveSubDepartmentDefaults(
  ctx: RequestContext,
  subDepartmentId: string,
  input: SaveSubDepartmentDefaultsInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate referenced account IDs exist
    const accountIds: string[] = [];
    if (input.revenueAccountId) accountIds.push(input.revenueAccountId);
    if (input.cogsAccountId) accountIds.push(input.cogsAccountId);
    if (input.inventoryAssetAccountId) accountIds.push(input.inventoryAssetAccountId);
    if (input.discountAccountId) accountIds.push(input.discountAccountId);
    if (input.returnsAccountId) accountIds.push(input.returnsAccountId);
    if (input.compAccountId) accountIds.push(input.compAccountId);

    if (accountIds.length > 0) {
      const accounts = await tx
        .select({ id: glAccounts.id })
        .from(glAccounts)
        .where(
          and(
            eq(glAccounts.tenantId, ctx.tenantId),
            inArray(glAccounts.id, accountIds),
          ),
        );

      const foundIds = new Set(accounts.map((a) => a.id));
      for (const id of accountIds) {
        if (!foundIds.has(id)) {
          throw new NotFoundError('GL Account', id);
        }
      }
    }

    // UPSERT
    const existing = await tx
      .select()
      .from(subDepartmentGlDefaults)
      .where(
        and(
          eq(subDepartmentGlDefaults.tenantId, ctx.tenantId),
          eq(subDepartmentGlDefaults.subDepartmentId, subDepartmentId),
        ),
      )
      .limit(1);

    const updateValues: Record<string, unknown> = { updatedAt: new Date() };
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) {
        updateValues[key] = value;
      }
    }

    let defaults;
    if (existing.length > 0) {
      [defaults] = await tx
        .update(subDepartmentGlDefaults)
        .set(updateValues)
        .where(
          and(
            eq(subDepartmentGlDefaults.tenantId, ctx.tenantId),
            eq(subDepartmentGlDefaults.subDepartmentId, subDepartmentId),
          ),
        )
        .returning();
    } else {
      [defaults] = await tx
        .insert(subDepartmentGlDefaults)
        .values({
          tenantId: ctx.tenantId,
          subDepartmentId,
          revenueAccountId: input.revenueAccountId ?? null,
          cogsAccountId: input.cogsAccountId ?? null,
          inventoryAssetAccountId: input.inventoryAssetAccountId ?? null,
          discountAccountId: input.discountAccountId ?? null,
          returnsAccountId: input.returnsAccountId ?? null,
          compAccountId: input.compAccountId ?? null,
        })
        .returning();
    }

    const event = buildEventFromContext(ctx, 'accounting.sub_department_defaults.saved.v1', {
      subDepartmentId,
    });

    return { result: defaults!, events: [event] };
  });

  await auditLog(ctx, 'accounting.sub_department_defaults.saved', 'sub_department_gl_defaults', subDepartmentId);

  // Auto-remap eligible tenders if enabled (never throws)
  const autoRemap = await tryAutoRemap(ctx);

  return { ...result, autoRemapCount: autoRemap.remapped, autoRemapFailed: autoRemap.failed };
}
