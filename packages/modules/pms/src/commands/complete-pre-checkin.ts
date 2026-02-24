import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, AppError } from '@oppsera/shared';
import { pmsGuestPortalSessions, pmsReservations, pmsGuests } from '@oppsera/db';
import type { CompletePreCheckinInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function completePreCheckin(
  ctx: RequestContext,
  token: string,
  input: CompletePreCheckinInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Find active session by token
    const [session] = await tx
      .select()
      .from(pmsGuestPortalSessions)
      .where(
        and(
          eq(pmsGuestPortalSessions.token, token),
          eq(pmsGuestPortalSessions.tenantId, ctx.tenantId),
          eq(pmsGuestPortalSessions.status, 'active'),
        ),
      )
      .limit(1);

    if (!session) {
      throw new NotFoundError('Guest portal session', token);
    }

    if (new Date() > session.expiresAt) {
      // Auto-expire
      await tx
        .update(pmsGuestPortalSessions)
        .set({ status: 'expired', updatedAt: new Date() })
        .where(eq(pmsGuestPortalSessions.id, session.id));
      throw new AppError('SESSION_EXPIRED', 'Guest portal session has expired', 410);
    }

    // Get reservation
    const [reservation] = await tx
      .select()
      .from(pmsReservations)
      .where(eq(pmsReservations.id, session.reservationId))
      .limit(1);

    if (!reservation) {
      throw new NotFoundError('Reservation', session.reservationId);
    }

    // Update guest details if provided
    if (input.guestDetails && reservation.guestId) {
      const guestUpdates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.guestDetails.email !== undefined) guestUpdates.email = input.guestDetails.email;
      if (input.guestDetails.phone !== undefined) guestUpdates.phone = input.guestDetails.phone;
      if (input.guestDetails.addressJson !== undefined) guestUpdates.addressJson = input.guestDetails.addressJson;

      if (Object.keys(guestUpdates).length > 1) {
        await tx
          .update(pmsGuests)
          .set(guestUpdates)
          .where(
            and(
              eq(pmsGuests.id, reservation.guestId),
              eq(pmsGuests.tenantId, ctx.tenantId),
            ),
          );
      }
    }

    // Save room preferences
    const roomPreferenceJson = input.roomPreference ?? null;

    // Mark session as pre-checkin completed
    const [updated] = await tx
      .update(pmsGuestPortalSessions)
      .set({
        preCheckinCompleted: true,
        roomPreferenceJson,
        updatedAt: new Date(),
      })
      .where(eq(pmsGuestPortalSessions.id, session.id))
      .returning();

    await pmsAuditLogEntry(
      tx, ctx, reservation.propertyId, 'guest_portal_session', session.id, 'pre_checkin_completed',
      { reservationId: session.reservationId },
    );

    const event = buildEventFromContext(ctx, PMS_EVENTS.PRE_CHECKIN_COMPLETED, {
      sessionId: session.id,
      reservationId: session.reservationId,
      propertyId: reservation.propertyId,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'pms.guest_portal.pre_checkin_completed', 'pms_guest_portal_session', result.id);

  return result;
}
