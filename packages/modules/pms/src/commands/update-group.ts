import { eq, and, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import { pmsGroups } from '@oppsera/db';
import type { UpdateGroupInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';
import { ConcurrencyConflictError } from '../errors';

export async function updateGroup(
  ctx: RequestContext,
  groupId: string,
  input: UpdateGroupInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch existing group
    const [existing] = await tx
      .select()
      .from(pmsGroups)
      .where(
        and(
          eq(pmsGroups.id, groupId),
          eq(pmsGroups.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundError('Group', groupId);
    }

    // Cancelled groups are immutable — use the reinstate command if needed
    if (existing.status === 'cancelled') {
      throw new ValidationError('Cannot modify a cancelled group', [
        { field: 'groupId', message: 'Group is cancelled and cannot be modified' },
      ]);
    }

    // Status transitions must use dedicated commands (cancel → cancelGroup)
    if (input.status === 'cancelled') {
      throw new ValidationError('Use the cancel command to cancel a group', [
        { field: 'status', message: 'Use the cancel endpoint to cancel a group' },
      ]);
    }

    // Build update fields (PATCH semantics)
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
      version: sql`version + 1`,
    };
    if (input.name !== undefined) updates.name = input.name;
    if (input.groupCode !== undefined) updates.groupCode = input.groupCode;
    if (input.groupType !== undefined) updates.groupType = input.groupType;
    if (input.contactName !== undefined) updates.contactName = input.contactName;
    if (input.contactEmail !== undefined) updates.contactEmail = input.contactEmail;
    if (input.contactPhone !== undefined) updates.contactPhone = input.contactPhone;
    if (input.ratePlanId !== undefined) updates.ratePlanId = input.ratePlanId;
    if (input.negotiatedRateCents !== undefined) updates.negotiatedRateCents = input.negotiatedRateCents;
    if (input.startDate !== undefined) updates.startDate = input.startDate;
    if (input.endDate !== undefined) updates.endDate = input.endDate;
    if (input.cutoffDate !== undefined) updates.cutoffDate = input.cutoffDate;
    if (input.status !== undefined) updates.status = input.status;
    if (input.billingType !== undefined) updates.billingType = input.billingType;
    if (input.notes !== undefined) updates.notes = input.notes;
    if (input.source !== undefined) updates.source = input.source;
    if (input.market !== undefined) updates.market = input.market;
    if (input.bookingMethod !== undefined) updates.bookingMethod = input.bookingMethod;
    if (input.salesRepUserId !== undefined) updates.salesRepUserId = input.salesRepUserId;
    if (input.specialRequests !== undefined) updates.specialRequests = input.specialRequests;
    if (input.groupComments !== undefined) updates.groupComments = input.groupComments;
    if (input.reservationComments !== undefined) updates.reservationComments = input.reservationComments;
    if (input.autoReleaseAtCutoff !== undefined) updates.autoReleaseAtCutoff = input.autoReleaseAtCutoff;
    if (input.shoulderDatesEnabled !== undefined) updates.shoulderDatesEnabled = input.shoulderDatesEnabled;
    if (input.shoulderStartDate !== undefined) updates.shoulderStartDate = input.shoulderStartDate;
    if (input.shoulderEndDate !== undefined) updates.shoulderEndDate = input.shoulderEndDate;
    if (input.shoulderRateCents !== undefined) updates.shoulderRateCents = input.shoulderRateCents;
    if (input.autoRoutePackagesToMaster !== undefined) updates.autoRoutePackagesToMaster = input.autoRoutePackagesToMaster;
    if (input.autoRouteSpecialsToMaster !== undefined) updates.autoRouteSpecialsToMaster = input.autoRouteSpecialsToMaster;

    // Optimistic locking: require version match
    const [updated] = await tx
      .update(pmsGroups)
      .set(updates)
      .where(
        and(
          eq(pmsGroups.id, groupId),
          eq(pmsGroups.tenantId, ctx.tenantId),
          eq(pmsGroups.version, input.version),
        ),
      )
      .returning();

    if (!updated) {
      // Check if group exists (for better error message)
      const [exists] = await tx
        .select({ id: pmsGroups.id })
        .from(pmsGroups)
        .where(and(eq(pmsGroups.id, groupId), eq(pmsGroups.tenantId, ctx.tenantId)))
        .limit(1);
      if (!exists) throw new NotFoundError('Group', groupId);
      throw new ConcurrencyConflictError(groupId);
    }

    // Compute diff for audit
    const diff: Record<string, { before: unknown; after: unknown }> = {};
    if (input.name !== undefined && existing.name !== updated!.name) {
      diff.name = { before: existing.name, after: updated!.name };
    }
    if (input.groupType !== undefined && existing.groupType !== updated!.groupType) {
      diff.groupType = { before: existing.groupType, after: updated!.groupType };
    }
    if (input.status !== undefined && existing.status !== updated!.status) {
      diff.status = { before: existing.status, after: updated!.status };
    }
    if (input.billingType !== undefined && existing.billingType !== updated!.billingType) {
      diff.billingType = { before: existing.billingType, after: updated!.billingType };
    }

    await pmsAuditLogEntry(
      tx, ctx, existing.propertyId, 'group', groupId, 'updated',
      Object.keys(diff).length > 0 ? diff : undefined,
    );

    const event = buildEventFromContext(ctx, PMS_EVENTS.GROUP_UPDATED, {
      groupId,
      propertyId: existing.propertyId,
      changes: diff,
    });

    return { result: updated!, events: [event] };
  });

  auditLogDeferred(ctx, 'pms.group.updated', 'pms_group', groupId);

  return result;
}
