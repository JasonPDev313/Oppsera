import { eq, and } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { pmsGuestPortalSessions, pmsReservations } from '@oppsera/db';
import type { CreateGuestPortalSessionInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function createGuestPortalSession(
  ctx: RequestContext,
  input: CreateGuestPortalSessionInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate reservation exists
    const [reservation] = await tx
      .select()
      .from(pmsReservations)
      .where(
        and(
          eq(pmsReservations.id, input.reservationId),
          eq(pmsReservations.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!reservation) {
      throw new NotFoundError('Reservation', input.reservationId);
    }

    // Expire any existing active sessions for this reservation
    await tx
      .update(pmsGuestPortalSessions)
      .set({ status: 'superseded', updatedAt: new Date() })
      .where(
        and(
          eq(pmsGuestPortalSessions.reservationId, input.reservationId),
          eq(pmsGuestPortalSessions.tenantId, ctx.tenantId),
          eq(pmsGuestPortalSessions.status, 'active'),
        ),
      );

    // Generate secure token (256-bit base64url)
    const token = randomBytes(32).toString('base64url');

    // Default expiry: 72 hours from now
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + (input.expiresInHours ?? 72));

    const [session] = await tx
      .insert(pmsGuestPortalSessions)
      .values({
        tenantId: ctx.tenantId,
        reservationId: input.reservationId,
        token,
        status: 'active',
        expiresAt,
      })
      .returning();

    await pmsAuditLogEntry(
      tx, ctx, reservation.propertyId, 'guest_portal_session', session!.id, 'created',
      { reservationId: input.reservationId },
    );

    const event = buildEventFromContext(ctx, PMS_EVENTS.GUEST_PORTAL_SESSION_CREATED, {
      sessionId: session!.id,
      reservationId: input.reservationId,
      propertyId: reservation.propertyId,
    });

    return { result: session!, events: [event] };
  });

  await auditLog(ctx, 'pms.guest_portal_session.created', 'pms_guest_portal_session', result.id);

  return result;
}
