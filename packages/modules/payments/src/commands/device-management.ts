import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError, generateUlid } from '@oppsera/shared';
import { terminalDeviceAssignments } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type {
  AssignDeviceInput,
  UpdateDeviceAssignmentInput,
  RemoveDeviceAssignmentInput,
} from '../validation/device-management';

/**
 * Assign a physical payment device (HSN) to a POS terminal.
 * One device per terminal (enforced by UNIQUE constraint).
 */
export async function assignDevice(ctx: RequestContext, input: AssignDeviceInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Check if terminal already has a device
    const [existing] = await tx
      .select({ id: terminalDeviceAssignments.id })
      .from(terminalDeviceAssignments)
      .where(
        and(
          eq(terminalDeviceAssignments.tenantId, ctx.tenantId),
          eq(terminalDeviceAssignments.terminalId, input.terminalId),
          eq(terminalDeviceAssignments.isActive, true),
        ),
      )
      .limit(1);

    if (existing) {
      throw new AppError(
        'DEVICE_ALREADY_ASSIGNED',
        'This terminal already has a device assigned. Remove it first.',
        409,
      );
    }

    // Check if HSN is already in use by another terminal
    const [hsnInUse] = await tx
      .select({ id: terminalDeviceAssignments.id, terminalId: terminalDeviceAssignments.terminalId })
      .from(terminalDeviceAssignments)
      .where(
        and(
          eq(terminalDeviceAssignments.tenantId, ctx.tenantId),
          eq(terminalDeviceAssignments.hsn, input.hsn),
          eq(terminalDeviceAssignments.isActive, true),
        ),
      )
      .limit(1);

    if (hsnInUse) {
      throw new AppError(
        'HSN_IN_USE',
        `HSN '${input.hsn}' is already assigned to another terminal`,
        409,
      );
    }

    const id = generateUlid();
    await tx.insert(terminalDeviceAssignments).values({
      id,
      tenantId: ctx.tenantId,
      terminalId: input.terminalId,
      providerId: input.providerId,
      hsn: input.hsn,
      deviceModel: input.deviceModel ?? null,
      deviceLabel: input.deviceLabel ?? null,
      isActive: true,
    });

    const event = buildEventFromContext(ctx, 'payments.device.assigned.v1', {
      deviceAssignmentId: id,
      terminalId: input.terminalId,
      hsn: input.hsn,
      deviceModel: input.deviceModel ?? null,
    });

    return { result: { id, terminalId: input.terminalId, hsn: input.hsn }, events: [event] };
  });

  await auditLog(ctx, 'payments.device.assigned', 'terminal_device_assignment', result.id);
  return result;
}

/**
 * Update a device assignment (HSN, model, label, active status).
 */
export async function updateDeviceAssignment(ctx: RequestContext, input: UpdateDeviceAssignmentInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(terminalDeviceAssignments)
      .where(
        and(
          eq(terminalDeviceAssignments.tenantId, ctx.tenantId),
          eq(terminalDeviceAssignments.id, input.id),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new AppError('DEVICE_NOT_FOUND', 'Device assignment not found', 404);
    }

    // If changing HSN, check it's not in use
    if (input.hsn && input.hsn !== existing.hsn) {
      const [hsnInUse] = await tx
        .select({ id: terminalDeviceAssignments.id })
        .from(terminalDeviceAssignments)
        .where(
          and(
            eq(terminalDeviceAssignments.tenantId, ctx.tenantId),
            eq(terminalDeviceAssignments.hsn, input.hsn),
            eq(terminalDeviceAssignments.isActive, true),
          ),
        )
        .limit(1);

      if (hsnInUse && hsnInUse.id !== input.id) {
        throw new AppError('HSN_IN_USE', `HSN '${input.hsn}' is already assigned to another terminal`, 409);
      }
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.hsn !== undefined) updates.hsn = input.hsn;
    if (input.deviceModel !== undefined) updates.deviceModel = input.deviceModel;
    if (input.deviceLabel !== undefined) updates.deviceLabel = input.deviceLabel;
    if (input.isActive !== undefined) updates.isActive = input.isActive;

    await tx
      .update(terminalDeviceAssignments)
      .set(updates)
      .where(eq(terminalDeviceAssignments.id, input.id));

    const event = buildEventFromContext(ctx, 'payments.device.updated.v1', {
      deviceAssignmentId: input.id,
      terminalId: existing.terminalId,
      changes: Object.keys(updates).filter((k) => k !== 'updatedAt'),
    });

    return { result: { id: input.id }, events: [event] };
  });

  await auditLog(ctx, 'payments.device.updated', 'terminal_device_assignment', result.id);
  return result;
}

/**
 * Remove (soft-delete) a device assignment.
 */
export async function removeDeviceAssignment(ctx: RequestContext, input: RemoveDeviceAssignmentInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [existing] = await tx
      .select({ id: terminalDeviceAssignments.id, terminalId: terminalDeviceAssignments.terminalId, hsn: terminalDeviceAssignments.hsn })
      .from(terminalDeviceAssignments)
      .where(
        and(
          eq(terminalDeviceAssignments.tenantId, ctx.tenantId),
          eq(terminalDeviceAssignments.id, input.id),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new AppError('DEVICE_NOT_FOUND', 'Device assignment not found', 404);
    }

    await tx
      .update(terminalDeviceAssignments)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(terminalDeviceAssignments.id, input.id));

    const event = buildEventFromContext(ctx, 'payments.device.removed.v1', {
      deviceAssignmentId: input.id,
      terminalId: existing.terminalId,
      hsn: existing.hsn,
    });

    return { result: { id: input.id }, events: [event] };
  });

  await auditLog(ctx, 'payments.device.removed', 'terminal_device_assignment', result.id);
  return result;
}
