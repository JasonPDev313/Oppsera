import { eq, and, inArray } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { glAccounts, paymentTypeGlDefaults } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';
import type { SavePaymentTypeDefaultsInput } from '../validation';
import { tryAutoRemap } from '../helpers/try-auto-remap';

export async function savePaymentTypeDefaults(
  ctx: RequestContext,
  paymentTypeId: string,
  input: SavePaymentTypeDefaultsInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate referenced account IDs exist
    const accountIds: string[] = [];
    if (input.cashAccountId) accountIds.push(input.cashAccountId);
    if (input.clearingAccountId) accountIds.push(input.clearingAccountId);
    if (input.feeExpenseAccountId) accountIds.push(input.feeExpenseAccountId);

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
      .from(paymentTypeGlDefaults)
      .where(
        and(
          eq(paymentTypeGlDefaults.tenantId, ctx.tenantId),
          eq(paymentTypeGlDefaults.paymentTypeId, paymentTypeId),
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
        .update(paymentTypeGlDefaults)
        .set(updateValues)
        .where(
          and(
            eq(paymentTypeGlDefaults.tenantId, ctx.tenantId),
            eq(paymentTypeGlDefaults.paymentTypeId, paymentTypeId),
          ),
        )
        .returning();
    } else {
      [defaults] = await tx
        .insert(paymentTypeGlDefaults)
        .values({
          tenantId: ctx.tenantId,
          paymentTypeId,
          cashAccountId: input.cashAccountId ?? null,
          clearingAccountId: input.clearingAccountId ?? null,
          feeExpenseAccountId: input.feeExpenseAccountId ?? null,
        })
        .returning();
    }

    const event = buildEventFromContext(ctx, 'accounting.payment_type_defaults.saved.v1', {
      paymentTypeId,
    });

    return { result: defaults!, events: [event] };
  });

  await auditLog(ctx, 'accounting.payment_type_defaults.saved', 'payment_type_gl_defaults', paymentTypeId);

  // Auto-remap eligible tenders if enabled (never throws)
  const autoRemap = await tryAutoRemap(ctx);

  return { ...result, autoRemapCount: autoRemap.remapped, autoRemapFailed: autoRemap.failed };
}
