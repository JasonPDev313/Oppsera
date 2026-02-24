import { and, eq, lt } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { pmsGuestPortalSessions } from '@oppsera/db';

export interface ExpireResult {
  expiredCount: number;
}

export async function expireGuestPortalSessions(
  tenantId: string,
): Promise<ExpireResult> {
  return withTenant(tenantId, async (tx) => {
    const now = new Date();
    const result = await tx
      .update(pmsGuestPortalSessions)
      .set({ status: 'expired', updatedAt: now })
      .where(
        and(
          eq(pmsGuestPortalSessions.tenantId, tenantId),
          eq(pmsGuestPortalSessions.status, 'active'),
          lt(pmsGuestPortalSessions.expiresAt, now),
        ),
      )
      .returning({ id: pmsGuestPortalSessions.id });

    return { expiredCount: result.length };
  });
}
