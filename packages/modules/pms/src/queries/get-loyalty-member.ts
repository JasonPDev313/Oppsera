import { eq, and } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { pmsLoyaltyMembers, pmsLoyaltyPrograms, pmsGuests } from '@oppsera/db';

export interface LoyaltyMemberDetail {
  id: string;
  guestId: string;
  guestName: string;
  programId: string;
  programName: string;
  pointsBalance: number;
  lifetimePoints: number;
  currentTier: string | null;
  enrolledAt: string;
  tiersJson: unknown;
}

/**
 * Get loyalty member by guest ID (finds first enrollment)
 */
export async function getLoyaltyMember(
  tenantId: string,
  guestId: string,
): Promise<LoyaltyMemberDetail | null> {
  return withTenant(tenantId, async (tx) => {
    const [member] = await tx
      .select()
      .from(pmsLoyaltyMembers)
      .where(
        and(
          eq(pmsLoyaltyMembers.guestId, guestId),
          eq(pmsLoyaltyMembers.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!member) return null;

    const [program] = await tx
      .select()
      .from(pmsLoyaltyPrograms)
      .where(eq(pmsLoyaltyPrograms.id, member.programId))
      .limit(1);

    const [guest] = await tx
      .select()
      .from(pmsGuests)
      .where(eq(pmsGuests.id, member.guestId))
      .limit(1);

    return {
      id: member.id,
      guestId: member.guestId,
      guestName: guest ? `${guest.firstName} ${guest.lastName}` : '',
      programId: member.programId,
      programName: program?.name ?? '',
      pointsBalance: member.pointsBalance,
      lifetimePoints: member.lifetimePoints,
      currentTier: member.currentTier,
      enrolledAt: member.enrolledAt.toISOString(),
      tiersJson: program?.tiersJson ?? [],
    };
  });
}
