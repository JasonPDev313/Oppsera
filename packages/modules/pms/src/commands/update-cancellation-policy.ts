/**
 * Update a cancellation policy.
 */
import { and, eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { pmsCancellationPolicies } from '@oppsera/db';
import type { UpdateCancellationPolicyInput } from '../validation';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function updateCancellationPolicy(
  ctx: RequestContext,
  policyId: string,
  input: UpdateCancellationPolicyInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(pmsCancellationPolicies)
      .where(
        and(
          eq(pmsCancellationPolicies.id, policyId),
          eq(pmsCancellationPolicies.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);
    if (!existing) throw new NotFoundError('CancellationPolicy', policyId);

    if (input.isDefault) {
      await tx
        .update(pmsCancellationPolicies)
        .set({ isDefault: false })
        .where(
          and(
            eq(pmsCancellationPolicies.tenantId, ctx.tenantId),
            eq(pmsCancellationPolicies.propertyId, existing.propertyId),
            eq(pmsCancellationPolicies.isDefault, true),
          ),
        );
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updates.name = input.name;
    if (input.penaltyType !== undefined) updates.penaltyType = input.penaltyType;
    if (input.percentagePct !== undefined) updates.percentagePct = input.percentagePct != null ? String(input.percentagePct) : null;
    if (input.fixedAmountCents !== undefined) updates.fixedAmountCents = input.fixedAmountCents;
    if (input.deadlineHours !== undefined) updates.deadlineHours = input.deadlineHours;
    if (input.isDefault !== undefined) updates.isDefault = input.isDefault;
    if (input.isActive !== undefined) updates.isActive = input.isActive;

    await tx
      .update(pmsCancellationPolicies)
      .set(updates)
      .where(
        and(
          eq(pmsCancellationPolicies.id, policyId),
          eq(pmsCancellationPolicies.tenantId, ctx.tenantId),
        ),
      );

    await pmsAuditLogEntry(tx, ctx, existing.propertyId, 'cancellation_policy', policyId, 'updated', updates);

    return { result: { id: policyId }, events: [] };
  });

  await auditLog(ctx, 'pms.cancellation_policy.updated', 'pms_cancellation_policy', policyId);
  return result;
}
