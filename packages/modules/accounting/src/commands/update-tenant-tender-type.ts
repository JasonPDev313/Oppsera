import { eq, and, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { glAccounts, tenantTenderTypes, glTransactionTypes } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';
import type { UpdateTenantTenderTypeInput } from '../validation';

export async function updateTenantTenderType(
  ctx: RequestContext,
  tenderTypeId: string,
  input: UpdateTenantTenderTypeInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Find existing
    const existing = await tx
      .select()
      .from(tenantTenderTypes)
      .where(
        and(
          eq(tenantTenderTypes.tenantId, ctx.tenantId),
          eq(tenantTenderTypes.id, tenderTypeId),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      throw new NotFoundError('Tender Type', tenderTypeId);
    }

    const current = existing[0]!;

    // Validate referenced account IDs
    const accountIds: string[] = [];
    if (input.defaultClearingAccountId) accountIds.push(input.defaultClearingAccountId);
    if (input.defaultBankAccountId) accountIds.push(input.defaultBankAccountId);
    if (input.defaultFeeAccountId) accountIds.push(input.defaultFeeAccountId);
    if (input.defaultExpenseAccountId) accountIds.push(input.defaultExpenseAccountId);

    if (accountIds.length > 0) {
      const accounts = await tx
        .select({ id: glAccounts.id })
        .from(glAccounts)
        .where(
          and(
            eq(glAccounts.tenantId, ctx.tenantId),
            sql`${glAccounts.id} = ANY(${accountIds})`,
          ),
        );
      const foundIds = new Set(accounts.map((a) => a.id));
      for (const id of accountIds) {
        if (!foundIds.has(id)) {
          throw new NotFoundError('GL Account', id);
        }
      }
    }

    // Build update values
    const updateValues: Record<string, unknown> = { updatedAt: new Date() };
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) {
        updateValues[key] = value;
      }
    }

    const [updated] = await tx
      .update(tenantTenderTypes)
      .set(updateValues)
      .where(
        and(
          eq(tenantTenderTypes.tenantId, ctx.tenantId),
          eq(tenantTenderTypes.id, tenderTypeId),
        ),
      )
      .returning();

    // Also update the gl_transaction_types entry if name changed
    if (input.name) {
      await tx.execute(sql`
        UPDATE gl_transaction_types
        SET name = ${input.name}, updated_at = NOW()
        WHERE tenant_id = ${ctx.tenantId} AND code = ${current.code}
      `);
    }

    // Update is_active in gl_transaction_types if changed
    if (input.isActive !== undefined) {
      await tx.execute(sql`
        UPDATE gl_transaction_types
        SET is_active = ${input.isActive}, updated_at = NOW()
        WHERE tenant_id = ${ctx.tenantId} AND code = ${current.code}
      `);
    }

    const event = buildEventFromContext(ctx, 'accounting.tender_type.updated.v1', {
      tenderTypeId,
      code: current.code,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'accounting.tender_type.updated', 'tenant_tender_types', tenderTypeId);

  return result;
}
