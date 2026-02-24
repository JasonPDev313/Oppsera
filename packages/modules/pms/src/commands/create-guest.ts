import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { pmsProperties, pmsGuests } from '@oppsera/db';
import type { CreateGuestInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function createGuest(ctx: RequestContext, input: CreateGuestInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate property exists and belongs to tenant
    const [property] = await tx
      .select()
      .from(pmsProperties)
      .where(
        and(
          eq(pmsProperties.id, input.propertyId),
          eq(pmsProperties.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!property) {
      throw new NotFoundError('Property', input.propertyId);
    }

    // Soft dedup on email: if email matches existing guest for same property, return existing
    if (input.email) {
      const [existingGuest] = await tx
        .select()
        .from(pmsGuests)
        .where(
          and(
            eq(pmsGuests.tenantId, ctx.tenantId),
            eq(pmsGuests.propertyId, input.propertyId),
            eq(pmsGuests.email, input.email),
          ),
        )
        .limit(1);

      if (existingGuest) {
        // Return existing guest without creating a new one or emitting events
        return { result: existingGuest, events: [] };
      }
    }

    const [created] = await tx
      .insert(pmsGuests)
      .values({
        tenantId: ctx.tenantId,
        propertyId: input.propertyId,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email ?? null,
        phone: input.phone ?? null,
        addressJson: input.addressJson ?? null,
        preferencesJson: input.preferencesJson ?? null,
        notes: input.notes ?? null,
        isVip: input.isVip ?? false,
        createdBy: ctx.user.id,
      })
      .returning();

    await pmsAuditLogEntry(tx, ctx, input.propertyId, 'guest', created!.id, 'created');

    const event = buildEventFromContext(ctx, PMS_EVENTS.GUEST_CREATED, {
      guestId: created!.id,
      propertyId: input.propertyId,
      firstName: created!.firstName,
      lastName: created!.lastName,
      email: created!.email,
      phone: created!.phone,
      isVip: created!.isVip,
    });

    return { result: created!, events: [event] };
  });

  // Only audit log if a new guest was created (events were emitted)
  // For dedup case, skip the top-level audit log since no mutation occurred
  if (result.createdBy === ctx.user.id) {
    await auditLog(ctx, 'pms.guest.created', 'pms_guest', result.id);
  }

  return result;
}
