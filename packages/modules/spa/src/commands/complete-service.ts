import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { spaAppointments, spaAppointmentItems, spaAppointmentHistory } from '@oppsera/db';
import { SPA_EVENTS } from '../events/types';
import { assertAppointmentTransition } from '../helpers/appointment-transitions';
import type { AppointmentStatus } from '../helpers/appointment-transitions';
import { AppError } from '@oppsera/shared';

interface CompleteServiceInput {
  id: string;
  expectedVersion?: number;
}

/**
 * Transitions an appointment from in_service to completed.
 *
 * Records the service completion timestamp and updates all in-progress
 * service items to completed status.
 */
export async function completeService(ctx: RequestContext, input: CompleteServiceInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(spaAppointments)
      .where(
        and(
          eq(spaAppointments.tenantId, ctx.tenantId),
          eq(spaAppointments.id, input.id),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new AppError('NOT_FOUND', `Appointment not found: ${input.id}`, 404);
    }

    if (existing.version !== input.expectedVersion) {
      throw new AppError(
        'VERSION_CONFLICT',
        `Expected version ${input.expectedVersion} but found ${existing.version}`,
        409,
      );
    }

    // Validate state transition: in_service → completed
    assertAppointmentTransition(existing.status as AppointmentStatus, 'completed');

    const now = new Date();

    const [updated] = await tx
      .update(spaAppointments)
      .set({
        status: 'completed',
        serviceCompletedAt: now,
        version: existing.version + 1,
        updatedBy: ctx.user.id,
        updatedAt: now,
      })
      .where(
        and(
          eq(spaAppointments.id, input.id),
          eq(spaAppointments.tenantId, ctx.tenantId),
        ),
      )
      .returning();

    // Update all in_progress items to completed
    await tx
      .update(spaAppointmentItems)
      .set({
        status: 'completed',
        updatedAt: now,
      })
      .where(
        and(
          eq(spaAppointmentItems.tenantId, ctx.tenantId),
          eq(spaAppointmentItems.appointmentId, input.id),
          eq(spaAppointmentItems.status, 'in_progress'),
        ),
      );

    await tx.insert(spaAppointmentHistory).values({
      tenantId: ctx.tenantId,
      appointmentId: input.id,
      action: 'service_completed',
      oldStatus: existing.status,
      newStatus: 'completed',
      performedBy: ctx.user.id,
    });

    // Fetch appointment items to enrich the event payload (consumer needs these for read model updates)
    const items = await tx
      .select()
      .from(spaAppointmentItems)
      .where(
        and(
          eq(spaAppointmentItems.tenantId, ctx.tenantId),
          eq(spaAppointmentItems.appointmentId, input.id),
        ),
      );

    const serviceItems = items.map((i) => ({
      serviceId: i.serviceId,
      addonId: (i as any).addonId ?? undefined,
      finalPriceCents: Number((i as any).finalPriceCents ?? 0),
      durationMinutes: Number((i as any).durationMinutes ?? 0),
    }));
    const totalCents = serviceItems.reduce((s, i) => s + i.finalPriceCents, 0);
    const durationMinutes = serviceItems.reduce((s, i) => s + i.durationMinutes, 0);

    const event = buildEventFromContext(ctx, SPA_EVENTS.APPOINTMENT_COMPLETED, {
      appointmentId: updated!.id,
      appointmentNumber: updated!.appointmentNumber,
      customerId: updated!.customerId,
      providerId: updated!.providerId,
      locationId: updated!.locationId ?? ctx.locationId ?? '',
      businessDate: now.toISOString().slice(0, 10),
      durationMinutes,
      serviceItems,
      totalCents,
      serviceCents: totalCents,
      addonCents: 0,
      tipCents: 0,
      commissionCents: 0,
      serviceCompletedAt: now.toISOString(),
    });

    return { result: updated!, events: [event] };
  });

  auditLogDeferred(ctx, 'spa.appointment.completed', 'spa_appointment', result.id);

  return result;
}
