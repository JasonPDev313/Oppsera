import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { pmsLoyaltyPrograms } from '@oppsera/db';
import type { UpdateLoyaltyProgramInput } from '../validation';
import { PMS_EVENTS } from '../events/types';

export async function updateLoyaltyProgram(
  ctx: RequestContext,
  id: string,
  input: UpdateLoyaltyProgramInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(pmsLoyaltyPrograms)
      .where(
        and(
          eq(pmsLoyaltyPrograms.id, id),
          eq(pmsLoyaltyPrograms.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!existing) throw new NotFoundError('Loyalty program', id);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updates.name = input.name;
    if (input.pointsPerDollar !== undefined) updates.pointsPerDollar = input.pointsPerDollar;
    if (input.pointsPerNight !== undefined) updates.pointsPerNight = input.pointsPerNight;
    if (input.redemptionValueCents !== undefined) updates.redemptionValueCents = input.redemptionValueCents;
    if (input.tiersJson !== undefined) updates.tiersJson = input.tiersJson;
    if (input.isActive !== undefined) updates.isActive = input.isActive;

    const [updated] = await tx
      .update(pmsLoyaltyPrograms)
      .set(updates)
      .where(
        and(
          eq(pmsLoyaltyPrograms.id, id),
          eq(pmsLoyaltyPrograms.tenantId, ctx.tenantId),
        ),
      )
      .returning();

    const event = buildEventFromContext(ctx, PMS_EVENTS.LOYALTY_PROGRAM_UPDATED, {
      programId: id,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'pms.loyalty_program.updated', 'pms_loyalty_program', result.id);
  return result;
}
