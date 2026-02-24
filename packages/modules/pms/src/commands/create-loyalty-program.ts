import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { pmsLoyaltyPrograms } from '@oppsera/db';
import type { CreateLoyaltyProgramInput } from '../validation';
import { PMS_EVENTS } from '../events/types';

export async function createLoyaltyProgram(
  ctx: RequestContext,
  input: CreateLoyaltyProgramInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [program] = await tx
      .insert(pmsLoyaltyPrograms)
      .values({
        tenantId: ctx.tenantId,
        name: input.name,
        pointsPerDollar: input.pointsPerDollar ?? 10,
        pointsPerNight: input.pointsPerNight ?? 0,
        redemptionValueCents: input.redemptionValueCents ?? 1,
        tiersJson: input.tiersJson ?? [],
        isActive: input.isActive ?? true,
      })
      .returning();

    const event = buildEventFromContext(ctx, PMS_EVENTS.LOYALTY_PROGRAM_CREATED, {
      programId: program!.id,
    });

    return { result: program!, events: [event] };
  });

  await auditLog(ctx, 'pms.loyalty_program.created', 'pms_loyalty_program', result.id);
  return result;
}
