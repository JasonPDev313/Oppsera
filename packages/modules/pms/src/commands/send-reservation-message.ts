/**
 * Send a templated message (email or SMS) for a reservation.
 * Resolves the template, renders variables, dispatches via gateway, and logs to pms_message_log.
 */
import { and, eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { generateUlid, NotFoundError, AppError } from '@oppsera/shared';
import {
  pmsMessageTemplates,
  pmsMessageLog,
  pmsReservations,
  pmsGuests,
  pmsProperties,
  pmsRoomTypes,
} from '@oppsera/db';
import type { SendReservationMessageInput } from '../validation';
import { renderTemplate, buildReservationTemplateData } from '../helpers/template-renderer';
import { getSmsGateway } from '../helpers/sms-gateway';
import { PMS_EVENTS } from '../events/types';

export async function sendReservationMessage(ctx: RequestContext, input: SendReservationMessageInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Load reservation
    const [reservation] = await tx
      .select()
      .from(pmsReservations)
      .where(and(eq(pmsReservations.id, input.reservationId), eq(pmsReservations.tenantId, ctx.tenantId)))
      .limit(1);
    if (!reservation) throw new NotFoundError('Reservation', input.reservationId);

    // Load guest
    if (!reservation.guestId) {
      throw new AppError('NO_GUEST', 'Reservation has no guest assigned', 400);
    }
    const guestId = reservation.guestId;
    const [guest] = await tx
      .select()
      .from(pmsGuests)
      .where(and(eq(pmsGuests.id, guestId), eq(pmsGuests.tenantId, ctx.tenantId)))
      .limit(1);
    if (!guest) throw new NotFoundError('Guest', guestId);

    // Load property
    const [property] = await tx
      .select()
      .from(pmsProperties)
      .where(and(eq(pmsProperties.id, reservation.propertyId), eq(pmsProperties.tenantId, ctx.tenantId)))
      .limit(1);
    if (!property) throw new NotFoundError('Property', reservation.propertyId);

    // Load room type name
    let roomTypeName = '';
    if (reservation.roomTypeId) {
      const [rt] = await tx
        .select({ name: pmsRoomTypes.name })
        .from(pmsRoomTypes)
        .where(eq(pmsRoomTypes.id, reservation.roomTypeId))
        .limit(1);
      if (rt) roomTypeName = rt.name;
    }

    // Load template
    const [template] = await tx
      .select()
      .from(pmsMessageTemplates)
      .where(
        and(
          eq(pmsMessageTemplates.tenantId, ctx.tenantId),
          eq(pmsMessageTemplates.propertyId, reservation.propertyId),
          eq(pmsMessageTemplates.templateKey, input.templateKey),
          eq(pmsMessageTemplates.channel, input.channel),
          eq(pmsMessageTemplates.isActive, true),
        ),
      )
      .limit(1);
    if (!template) {
      throw new AppError('TEMPLATE_NOT_FOUND', `No active ${input.channel} template for '${input.templateKey}'`, 404);
    }

    // Render template
    const templateData = buildReservationTemplateData(
      {
        confirmationNumber: reservation.confirmationNumber ?? undefined,
        checkInDate: reservation.checkInDate,
        checkOutDate: reservation.checkOutDate,
        roomTypeName,
        totalCents: reservation.totalCents ?? undefined,
      },
      {
        firstName: guest.firstName,
        lastName: guest.lastName ?? undefined,
        email: guest.email ?? undefined,
        phone: guest.phone ?? undefined,
      },
      {
        name: property.name,
        checkInTime: property.checkInTime ?? undefined,
        checkOutTime: property.checkOutTime ?? undefined,
      },
    );
    const renderedBody = renderTemplate(template.bodyTemplate, templateData);
    const renderedSubject = template.subject ? renderTemplate(template.subject, templateData) : null;

    // Determine recipient
    const recipient = input.channel === 'email' ? (guest.email ?? null) : (guest.phone ?? null);

    // Dispatch message
    let status: string = 'sent';
    let externalId: string | null = null;
    let sentAt: Date | null = new Date();

    if (input.channel === 'sms' && recipient) {
      try {
        const smsResult = await getSmsGateway().sendSms(recipient, renderedBody);
        externalId = smsResult.messageId;
        status = 'sent';
      } catch {
        status = 'failed';
        sentAt = null;
      }
    } else if (input.channel === 'email') {
      // Email sending is a placeholder — would integrate with SendGrid/SES
      console.info(`[PMS Email] To: ${recipient} | Subject: ${renderedSubject} | Body: ${renderedBody.substring(0, 100)}...`);
      status = 'sent';
    }

    // Log message
    const logId = generateUlid();
    await tx.insert(pmsMessageLog).values({
      id: logId,
      tenantId: ctx.tenantId,
      propertyId: reservation.propertyId,
      reservationId: reservation.id,
      guestId: guest.id,
      channel: input.channel,
      direction: 'outbound',
      messageType: input.templateKey === 'booking_confirmation' ? 'confirmation' : input.templateKey,
      subject: renderedSubject,
      body: renderedBody,
      recipient,
      status,
      sentAt,
      externalId,
      createdBy: ctx.user.id,
    });

    const eventType = status === 'sent' ? PMS_EVENTS.MESSAGE_SENT : PMS_EVENTS.MESSAGE_FAILED;
    const event = buildEventFromContext(ctx, eventType, {
      messageLogId: logId,
      reservationId: reservation.id,
      guestId: guest.id,
      channel: input.channel,
      templateKey: input.templateKey,
      status,
    });

    return { result: { id: logId, status }, events: [event] };
  });

  await auditLog(ctx, 'pms.message.sent', 'pms_message_log', result.id);
  return result;
}
