import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { auditLog } from '@oppsera/core/audit/helpers';
import { AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { spaWaitlist, spaServices, spaAppointments } from '@oppsera/db';
import { SPA_EVENTS } from '../events/types';
import { addToWaitlistSchema } from '../validation';
import type { AddToWaitlistInput } from '../validation';

export async function addToWaitlist(ctx: RequestContext, input: AddToWaitlistInput) {
  const parsed = addToWaitlistSchema.parse(input);

  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, parsed.clientRequestId, 'addToWaitlist');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    const [service] = await tx
      .select({ id: spaServices.id })
      .from(spaServices)
      .where(
        and(
          eq(spaServices.tenantId, ctx.tenantId),
          eq(spaServices.id, parsed.serviceId),
        ),
      )
      .limit(1);

    if (!service) {
      throw new AppError('NOT_FOUND', `Service not found: ${parsed.serviceId}`, 404);
    }

    const [duplicate] = await tx
      .select({ id: spaWaitlist.id })
      .from(spaWaitlist)
      .where(
        and(
          eq(spaWaitlist.tenantId, ctx.tenantId),
          eq(spaWaitlist.customerId, parsed.customerId),
          eq(spaWaitlist.serviceId, parsed.serviceId),
          eq(spaWaitlist.status, 'waiting'),
        ),
      )
      .limit(1);

    if (duplicate) {
      throw new AppError('VALIDATION_ERROR', 'Customer already has a waiting entry for this service', 400);
    }

    const [created] = await tx
      .insert(spaWaitlist)
      .values({
        tenantId: ctx.tenantId,
        customerId: parsed.customerId,
        serviceId: parsed.serviceId,
        preferredProviderId: parsed.preferredProviderId ?? null,
        preferredDate: parsed.preferredDate ?? null,
        preferredTimeStart: parsed.preferredTimeStart ?? null,
        preferredTimeEnd: parsed.preferredTimeEnd ?? null,
        flexibility: parsed.flexibility,
        priority: parsed.priority,
        notes: parsed.notes ?? null,
        expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null,
      })
      .returning();

    await saveIdempotencyKey(tx, ctx.tenantId, parsed.clientRequestId, 'addToWaitlist', created!);

    const event = buildEventFromContext(ctx, SPA_EVENTS.WAITLIST_ADDED, {
      waitlistId: created!.id,
      customerId: parsed.customerId,
      serviceId: parsed.serviceId,
      preferredProviderId: parsed.preferredProviderId,
      flexibility: parsed.flexibility,
      priority: parsed.priority,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'spa.waitlist.added', 'spa_waitlist', result.id);

  return result;
}

export async function removeFromWaitlist(ctx: RequestContext, input: { id: string }) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(spaWaitlist)
      .where(
        and(
          eq(spaWaitlist.tenantId, ctx.tenantId),
          eq(spaWaitlist.id, input.id),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new AppError('NOT_FOUND', `Waitlist entry not found: ${input.id}`, 404);
    }

    if (existing.status !== 'waiting' && existing.status !== 'offered') {
      throw new AppError('VALIDATION_ERROR', `Cannot remove waitlist entry with status: ${existing.status}`, 400);
    }

    const [updated] = await tx
      .update(spaWaitlist)
      .set({
        status: 'canceled',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(spaWaitlist.tenantId, ctx.tenantId),
          eq(spaWaitlist.id, input.id),
        ),
      )
      .returning();

    return { result: updated!, events: [] };
  });

  await auditLog(ctx, 'spa.waitlist.removed', 'spa_waitlist', result.id);

  return result;
}

export async function offerWaitlistSlot(ctx: RequestContext, input: { id: string; appointmentId: string }) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(spaWaitlist)
      .where(
        and(
          eq(spaWaitlist.tenantId, ctx.tenantId),
          eq(spaWaitlist.id, input.id),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new AppError('NOT_FOUND', `Waitlist entry not found: ${input.id}`, 404);
    }

    if (existing.status !== 'waiting') {
      throw new AppError('VALIDATION_ERROR', `Cannot offer slot to waitlist entry with status: ${existing.status}`, 400);
    }

    const [appointment] = await tx
      .select({ id: spaAppointments.id })
      .from(spaAppointments)
      .where(
        and(
          eq(spaAppointments.tenantId, ctx.tenantId),
          eq(spaAppointments.id, input.appointmentId),
        ),
      )
      .limit(1);

    if (!appointment) {
      throw new AppError('NOT_FOUND', `Appointment not found: ${input.appointmentId}`, 404);
    }

    const expiresAt = existing.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000);

    const [updated] = await tx
      .update(spaWaitlist)
      .set({
        status: 'offered',
        offeredAppointmentId: input.appointmentId,
        expiresAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(spaWaitlist.tenantId, ctx.tenantId),
          eq(spaWaitlist.id, input.id),
        ),
      )
      .returning();

    const event = buildEventFromContext(ctx, SPA_EVENTS.WAITLIST_OFFERED, {
      waitlistId: updated!.id,
      customerId: existing.customerId,
      serviceId: existing.serviceId,
      appointmentId: input.appointmentId,
      expiresAt: expiresAt.toISOString(),
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'spa.waitlist.offered', 'spa_waitlist', result.id);

  return result;
}

export async function acceptWaitlistOffer(ctx: RequestContext, input: { id: string }) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(spaWaitlist)
      .where(
        and(
          eq(spaWaitlist.tenantId, ctx.tenantId),
          eq(spaWaitlist.id, input.id),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new AppError('NOT_FOUND', `Waitlist entry not found: ${input.id}`, 404);
    }

    if (existing.status !== 'offered') {
      throw new AppError('VALIDATION_ERROR', `Cannot accept waitlist entry with status: ${existing.status}`, 400);
    }

    const [updated] = await tx
      .update(spaWaitlist)
      .set({
        status: 'booked',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(spaWaitlist.tenantId, ctx.tenantId),
          eq(spaWaitlist.id, input.id),
        ),
      )
      .returning();

    return { result: updated!, events: [] };
  });

  await auditLog(ctx, 'spa.waitlist.accepted', 'spa_waitlist', result.id);

  return result;
}

export async function declineWaitlistOffer(ctx: RequestContext, input: { id: string }) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(spaWaitlist)
      .where(
        and(
          eq(spaWaitlist.tenantId, ctx.tenantId),
          eq(spaWaitlist.id, input.id),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new AppError('NOT_FOUND', `Waitlist entry not found: ${input.id}`, 404);
    }

    if (existing.status !== 'offered') {
      throw new AppError('VALIDATION_ERROR', `Cannot decline waitlist entry with status: ${existing.status}`, 400);
    }

    const [updated] = await tx
      .update(spaWaitlist)
      .set({
        status: 'waiting',
        offeredAppointmentId: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(spaWaitlist.tenantId, ctx.tenantId),
          eq(spaWaitlist.id, input.id),
        ),
      )
      .returning();

    return { result: updated!, events: [] };
  });

  await auditLog(ctx, 'spa.waitlist.declined', 'spa_waitlist', result.id);

  return result;
}
