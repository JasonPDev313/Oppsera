import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { pmsGuests } from '@oppsera/db';
import type { UpdateGuestInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function updateGuest(
  ctx: RequestContext,
  guestId: string,
  input: UpdateGuestInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch existing guest
    const [existing] = await tx
      .select()
      .from(pmsGuests)
      .where(
        and(
          eq(pmsGuests.id, guestId),
          eq(pmsGuests.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundError('Guest', guestId);
    }

    // Build update fields (PATCH semantics)
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (input.firstName !== undefined) updates.firstName = input.firstName;
    if (input.lastName !== undefined) updates.lastName = input.lastName;
    if (input.email !== undefined) updates.email = input.email;
    if (input.phone !== undefined) updates.phone = input.phone;
    if (input.addressJson !== undefined) updates.addressJson = input.addressJson;
    if (input.preferencesJson !== undefined) updates.preferencesJson = input.preferencesJson;
    if (input.notes !== undefined) updates.notes = input.notes;
    if (input.isVip !== undefined) updates.isVip = input.isVip;

    const [updated] = await tx
      .update(pmsGuests)
      .set(updates)
      .where(and(eq(pmsGuests.id, guestId), eq(pmsGuests.tenantId, ctx.tenantId)))
      .returning();

    // Compute diff for audit (PII fields will be redacted by pmsAuditLogEntry)
    const diff: Record<string, { before: unknown; after: unknown }> = {};
    if (input.firstName !== undefined && existing.firstName !== updated!.firstName) {
      diff.firstName = { before: existing.firstName, after: updated!.firstName };
    }
    if (input.lastName !== undefined && existing.lastName !== updated!.lastName) {
      diff.lastName = { before: existing.lastName, after: updated!.lastName };
    }
    if (input.email !== undefined && existing.email !== updated!.email) {
      diff.email = { before: existing.email, after: updated!.email };
    }
    if (input.phone !== undefined && existing.phone !== updated!.phone) {
      diff.phone = { before: existing.phone, after: updated!.phone };
    }
    if (input.isVip !== undefined && existing.isVip !== updated!.isVip) {
      diff.isVip = { before: existing.isVip, after: updated!.isVip };
    }
    if (input.notes !== undefined && existing.notes !== updated!.notes) {
      diff.notes = { before: existing.notes, after: updated!.notes };
    }

    await pmsAuditLogEntry(
      tx, ctx, existing.propertyId, 'guest', guestId, 'updated',
      Object.keys(diff).length > 0 ? diff : undefined,
    );

    const event = buildEventFromContext(ctx, PMS_EVENTS.GUEST_UPDATED, {
      guestId,
      propertyId: existing.propertyId,
      changes: Object.keys(diff),
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'pms.guest.updated', 'pms_guest', guestId);

  return result;
}
