import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, AppError } from '@oppsera/shared';
import { pmsLoyaltyPrograms, pmsLoyaltyMembers, pmsGuests } from '@oppsera/db';
import type { EnrollLoyaltyGuestInput } from '../validation';
import { PMS_EVENTS } from '../events/types';

export async function enrollLoyaltyGuest(
  ctx: RequestContext,
  input: EnrollLoyaltyGuestInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate program exists and is active
    const [program] = await tx
      .select()
      .from(pmsLoyaltyPrograms)
      .where(
        and(
          eq(pmsLoyaltyPrograms.id, input.programId),
          eq(pmsLoyaltyPrograms.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!program) throw new NotFoundError('Loyalty program', input.programId);
    if (!program.isActive) throw new AppError('PROGRAM_INACTIVE', 'Loyalty program is not active', 400);

    // Validate guest exists
    const [guest] = await tx
      .select()
      .from(pmsGuests)
      .where(
        and(
          eq(pmsGuests.id, input.guestId),
          eq(pmsGuests.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!guest) throw new NotFoundError('Guest', input.guestId);

    // Check if already enrolled (UNIQUE constraint will also catch this)
    const [existing] = await tx
      .select()
      .from(pmsLoyaltyMembers)
      .where(
        and(
          eq(pmsLoyaltyMembers.guestId, input.guestId),
          eq(pmsLoyaltyMembers.programId, input.programId),
          eq(pmsLoyaltyMembers.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (existing) {
      throw new AppError('ALREADY_ENROLLED', 'Guest is already enrolled in this program', 409);
    }

    // Determine initial tier
    const tiers = (program.tiersJson as Array<{ name: string; minPoints: number }>) ?? [];
    const initialTier = tiers.length > 0 ? tiers[0]!.name : null;

    const [member] = await tx
      .insert(pmsLoyaltyMembers)
      .values({
        tenantId: ctx.tenantId,
        guestId: input.guestId,
        programId: input.programId,
        pointsBalance: 0,
        lifetimePoints: 0,
        currentTier: initialTier,
      })
      .returning();

    const event = buildEventFromContext(ctx, PMS_EVENTS.LOYALTY_MEMBER_ENROLLED, {
      memberId: member!.id,
      guestId: input.guestId,
      programId: input.programId,
    });

    return { result: member!, events: [event] };
  });

  await auditLog(ctx, 'pms.loyalty_member.enrolled', 'pms_loyalty_member', result.id);
  return result;
}
