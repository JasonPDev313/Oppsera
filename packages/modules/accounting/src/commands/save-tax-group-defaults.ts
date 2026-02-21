import { eq, and, inArray } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { glAccounts, taxGroupGlDefaults } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';
import type { SaveTaxGroupDefaultsInput } from '../validation';

export async function saveTaxGroupDefaults(
  ctx: RequestContext,
  taxGroupId: string,
  input: SaveTaxGroupDefaultsInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate referenced account IDs exist
    const accountIds: string[] = [];
    if (input.taxPayableAccountId) accountIds.push(input.taxPayableAccountId);

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
      .from(taxGroupGlDefaults)
      .where(
        and(
          eq(taxGroupGlDefaults.tenantId, ctx.tenantId),
          eq(taxGroupGlDefaults.taxGroupId, taxGroupId),
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
        .update(taxGroupGlDefaults)
        .set(updateValues)
        .where(
          and(
            eq(taxGroupGlDefaults.tenantId, ctx.tenantId),
            eq(taxGroupGlDefaults.taxGroupId, taxGroupId),
          ),
        )
        .returning();
    } else {
      [defaults] = await tx
        .insert(taxGroupGlDefaults)
        .values({
          tenantId: ctx.tenantId,
          taxGroupId,
          taxPayableAccountId: input.taxPayableAccountId ?? null,
        })
        .returning();
    }

    const event = buildEventFromContext(ctx, 'accounting.tax_group_defaults.saved.v1', {
      taxGroupId,
    });

    return { result: defaults!, events: [event] };
  });

  await auditLog(ctx, 'accounting.tax_group_defaults.saved', 'tax_group_gl_defaults', taxGroupId);
  return result;
}
