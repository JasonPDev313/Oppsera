/**
 * Create a cancellation policy for a property.
 */
import { and, eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { generateUlid, NotFoundError } from '@oppsera/shared';
import { pmsCancellationPolicies, pmsProperties } from '@oppsera/db';
import type { CreateCancellationPolicyInput } from '../validation';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function createCancellationPolicy(ctx: RequestContext, input: CreateCancellationPolicyInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [property] = await tx
      .select()
      .from(pmsProperties)
      .where(and(eq(pmsProperties.id, input.propertyId), eq(pmsProperties.tenantId, ctx.tenantId)))
      .limit(1);
    if (!property) throw new NotFoundError('Property', input.propertyId);

    if (input.isDefault) {
      await tx
        .update(pmsCancellationPolicies)
        .set({ isDefault: false })
        .where(
          and(
            eq(pmsCancellationPolicies.tenantId, ctx.tenantId),
            eq(pmsCancellationPolicies.propertyId, input.propertyId),
            eq(pmsCancellationPolicies.isDefault, true),
          ),
        );
    }

    const id = generateUlid();
    await tx.insert(pmsCancellationPolicies).values({
      id,
      tenantId: ctx.tenantId,
      propertyId: input.propertyId,
      name: input.name,
      penaltyType: input.penaltyType ?? 'none',
      percentagePct: input.percentagePct != null ? String(input.percentagePct) : null,
      fixedAmountCents: input.fixedAmountCents ?? null,
      deadlineHours: input.deadlineHours ?? 24,
      isDefault: input.isDefault ?? false,
    });

    await pmsAuditLogEntry(tx, ctx, input.propertyId, 'cancellation_policy', id, 'created', {
      name: input.name,
      penaltyType: input.penaltyType,
    });

    return { result: { id }, events: [] };
  });

  await auditLog(ctx, 'pms.cancellation_policy.created', 'pms_cancellation_policy', result.id);
  return result;
}
