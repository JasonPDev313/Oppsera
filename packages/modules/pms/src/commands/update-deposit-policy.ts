/**
 * Update a deposit policy.
 */
import { and, eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { pmsDepositPolicies } from '@oppsera/db';
import type { UpdateDepositPolicyInput } from '../validation';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function updateDepositPolicy(
  ctx: RequestContext,
  policyId: string,
  input: UpdateDepositPolicyInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(pmsDepositPolicies)
      .where(
        and(
          eq(pmsDepositPolicies.id, policyId),
          eq(pmsDepositPolicies.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);
    if (!existing) throw new NotFoundError('DepositPolicy', policyId);

    if (input.isDefault) {
      await tx
        .update(pmsDepositPolicies)
        .set({ isDefault: false })
        .where(
          and(
            eq(pmsDepositPolicies.tenantId, ctx.tenantId),
            eq(pmsDepositPolicies.propertyId, existing.propertyId),
            eq(pmsDepositPolicies.isDefault, true),
          ),
        );
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updates.name = input.name;
    if (input.depositType !== undefined) updates.depositType = input.depositType;
    if (input.percentagePct !== undefined) updates.percentagePct = input.percentagePct != null ? String(input.percentagePct) : null;
    if (input.fixedAmountCents !== undefined) updates.fixedAmountCents = input.fixedAmountCents;
    if (input.chargeTiming !== undefined) updates.chargeTiming = input.chargeTiming;
    if (input.daysBefore !== undefined) updates.daysBefore = input.daysBefore;
    if (input.isDefault !== undefined) updates.isDefault = input.isDefault;
    if (input.isActive !== undefined) updates.isActive = input.isActive;

    await tx
      .update(pmsDepositPolicies)
      .set(updates)
      .where(
        and(
          eq(pmsDepositPolicies.id, policyId),
          eq(pmsDepositPolicies.tenantId, ctx.tenantId),
        ),
      );

    await pmsAuditLogEntry(tx, ctx, existing.propertyId, 'deposit_policy', policyId, 'updated', updates);

    return { result: { id: policyId }, events: [] };
  });

  await auditLog(ctx, 'pms.deposit_policy.updated', 'pms_deposit_policy', policyId);
  return result;
}
