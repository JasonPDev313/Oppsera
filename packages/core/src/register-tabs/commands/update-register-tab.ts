import type { RequestContext } from '../../auth/context';
import { publishWithOutbox } from '../../events/publish-with-outbox';
import { buildEventFromContext } from '../../events/build-event';
import { auditLog } from '../../audit/helpers';
import { AppError, NotFoundError } from '@oppsera/shared';
import { registerTabs } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import type { UpdateRegisterTabInput } from '../validation';
import type { RegisterTabRow } from '../types';

export async function updateRegisterTab(
  ctx: RequestContext,
  input: UpdateRegisterTabInput,
): Promise<RegisterTabRow> {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch current row
    const [current] = await tx
      .select()
      .from(registerTabs)
      .where(
        and(
          eq(registerTabs.id, input.tabId),
          eq(registerTabs.tenantId, ctx.tenantId),
        ),
      );

    if (!current) {
      throw new NotFoundError('Register tab', input.tabId);
    }

    if (current.status === 'closed') {
      throw new AppError('TAB_CLOSED', 'Cannot update a closed tab', 409);
    }

    // Optimistic locking check
    if (input.expectedVersion !== undefined && current.version !== input.expectedVersion) {
      throw new AppError(
        'VERSION_CONFLICT',
        `Tab was modified by another device (expected version ${input.expectedVersion}, current ${current.version})`,
        409,
      );
    }

    // Build update set — only include provided fields
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
      lastActivityAt: new Date(),
      version: sql`${registerTabs.version} + 1`,
    };
    if (input.orderId !== undefined) updates.orderId = input.orderId;
    if (input.label !== undefined) updates.label = input.label;
    if (input.employeeId !== undefined) updates.employeeId = input.employeeId;
    if (input.employeeName !== undefined) updates.employeeName = input.employeeName;
    if (input.deviceId !== undefined) updates.deviceId = input.deviceId;
    if (input.metadata !== undefined) updates.metadata = input.metadata;
    if (input.folioId !== undefined) updates.folioId = input.folioId;
    if (input.guestName !== undefined) updates.guestName = input.guestName;

    const [updated] = await tx
      .update(registerTabs)
      .set(updates)
      .where(
        and(
          eq(registerTabs.id, input.tabId),
          eq(registerTabs.tenantId, ctx.tenantId),
        ),
      )
      .returning();

    const event = buildEventFromContext(
      ctx,
      'pos.register_tab.updated.v1',
      {
        tabId: updated!.id,
        terminalId: updated!.terminalId,
        tabNumber: updated!.tabNumber,
        version: updated!.version,
        changes: {
          ...(input.orderId !== undefined && { orderId: { old: current.orderId, new: input.orderId } }),
          ...(input.label !== undefined && { label: { old: current.label, new: input.label } }),
          ...(input.employeeId !== undefined && { employeeId: { old: current.employeeId, new: input.employeeId } }),
          ...(input.folioId !== undefined && { folioId: { old: current.folioId, new: input.folioId } }),
          ...(input.guestName !== undefined && { guestName: { old: current.guestName, new: input.guestName } }),
        },
      },
    );

    return { result: updated!, events: [event] };
  });

  // Audit employee change specifically
  if (input.employeeId !== undefined) {
    await auditLog(ctx, 'register_tab.updated', 'register_tab', result.id, {
      employeeId: { old: null, new: input.employeeId },
      employeeName: { old: null, new: input.employeeName ?? null },
    });
  }

  return result as RegisterTabRow;
}
