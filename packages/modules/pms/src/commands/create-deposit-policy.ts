/**
 * Create a deposit policy for a property.
 */
import { and, eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { generateUlid, NotFoundError } from '@oppsera/shared';
import { pmsDepositPolicies, pmsProperties } from '@oppsera/db';
import type { CreateDepositPolicyInput } from '../validation';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function createDepositPolicy(ctx: RequestContext, input: CreateDepositPolicyInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [property] = await tx
      .select()
      .from(pmsProperties)
      .where(and(eq(pmsProperties.id, input.propertyId), eq(pmsProperties.tenantId, ctx.tenantId)))
      .limit(1);
    if (!property) throw new NotFoundError('Property', input.propertyId);

    // If setting as default, clear other defaults
    if (input.isDefault) {
      await tx
        .update(pmsDepositPolicies)
        .set({ isDefault: false })
        .where(
          and(
            eq(pmsDepositPolicies.tenantId, ctx.tenantId),
            eq(pmsDepositPolicies.propertyId, input.propertyId),
            eq(pmsDepositPolicies.isDefault, true),
          ),
        );
    }

    const id = generateUlid();
    await tx.insert(pmsDepositPolicies).values({
      id,
      tenantId: ctx.tenantId,
      propertyId: input.propertyId,
      name: input.name,
      depositType: input.depositType ?? 'first_night',
      percentagePct: input.percentagePct != null ? String(input.percentagePct) : null,
      fixedAmountCents: input.fixedAmountCents ?? null,
      chargeTiming: input.chargeTiming ?? 'at_booking',
      daysBefore: input.daysBefore ?? null,
      isDefault: input.isDefault ?? false,
    });

    await pmsAuditLogEntry(tx, ctx, input.propertyId, 'deposit_policy', id, 'created', {
      name: input.name,
      depositType: input.depositType,
    });

    return { result: { id }, events: [] };
  });

  await auditLog(ctx, 'pms.deposit_policy.created', 'pms_deposit_policy', result.id);
  return result;
}
