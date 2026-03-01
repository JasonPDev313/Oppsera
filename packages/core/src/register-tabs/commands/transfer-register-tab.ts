import type { RequestContext } from '../../auth/context';
import { publishWithOutbox } from '../../events/publish-with-outbox';
import { buildEventFromContext } from '../../events/build-event';
import { auditLog } from '../../audit/helpers';
import { AppError, NotFoundError, ConflictError, generateUlid } from '@oppsera/shared';
import { registerTabs } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import type { TransferRegisterTabInput } from '../validation';
import type { RegisterTabRow } from '../types';

interface TransferResult {
  sourceTab: RegisterTabRow;
  targetTab: RegisterTabRow;
  orderId: string;
}

export async function transferRegisterTab(
  ctx: RequestContext,
  input: TransferRegisterTabInput,
): Promise<TransferResult> {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Fetch source tab
    const [sourceTab] = await tx
      .select()
      .from(registerTabs)
      .where(
        and(
          eq(registerTabs.id, input.sourceTabId),
          eq(registerTabs.tenantId, ctx.tenantId),
        ),
      );

    if (!sourceTab) {
      throw new NotFoundError('Source tab', input.sourceTabId);
    }

    if (!sourceTab.orderId) {
      throw new ConflictError('Source tab has no order to transfer');
    }

    if (sourceTab.status === 'closed') {
      throw new AppError('TAB_CLOSED', 'Cannot transfer from a closed tab', 409);
    }

    // Optimistic locking check
    if (input.expectedVersion !== undefined && sourceTab.version !== input.expectedVersion) {
      throw new AppError(
        'VERSION_CONFLICT',
        `Tab was modified by another device (expected version ${input.expectedVersion}, current ${sourceTab.version})`,
        409,
      );
    }

    const orderId = sourceTab.orderId;

    // 2. Clear orderId + associated fields from source tab (atomically within this transaction)
    const [updatedSource] = await tx
      .update(registerTabs)
      .set({
        orderId: null,
        label: null,
        folioId: null,
        guestName: null,
        updatedAt: new Date(),
        version: sql`${registerTabs.version} + 1`,
      })
      .where(eq(registerTabs.id, input.sourceTabId))
      .returning();

    // 3. Find or create target tab on the target terminal
    const [existingTarget] = await tx
      .select()
      .from(registerTabs)
      .where(
        and(
          eq(registerTabs.tenantId, ctx.tenantId),
          eq(registerTabs.terminalId, input.targetTerminalId),
          eq(registerTabs.tabNumber, input.targetTabNumber),
        ),
      );

    let targetTab;

    if (existingTarget) {
      const [updated] = await tx
        .update(registerTabs)
        .set({
          orderId,
          updatedAt: new Date(),
          version: sql`${registerTabs.version} + 1`,
        })
        .where(eq(registerTabs.id, existingTarget.id))
        .returning();
      targetTab = updated!;
    } else {
      const [created] = await tx
        .insert(registerTabs)
        .values({
          id: generateUlid(),
          tenantId: ctx.tenantId,
          terminalId: input.targetTerminalId,
          tabNumber: input.targetTabNumber,
          orderId,
          employeeId: ctx.user.id,
          employeeName: ctx.user.name,
          locationId: sourceTab.locationId,
          version: 1,
          status: 'active',
        })
        .returning();
      targetTab = created!;
    }

    const event = buildEventFromContext(
      ctx,
      'pos.register_tab.transferred.v1',
      {
        sourceTabId: updatedSource!.id,
        targetTabId: targetTab.id,
        orderId,
        sourceTerminalId: sourceTab.terminalId,
        targetTerminalId: input.targetTerminalId,
        sourceTabNumber: sourceTab.tabNumber,
        targetTabNumber: input.targetTabNumber,
      },
    );

    return {
      result: {
        sourceTab: updatedSource!,
        targetTab,
        orderId,
      },
      events: [event],
    };
  });

  await auditLog(ctx, 'register_tab.transferred', 'register_tab', input.sourceTabId, {
    terminalId: { old: result.sourceTab.terminalId, new: input.targetTerminalId },
    tabNumber: { old: result.sourceTab.tabNumber, new: input.targetTabNumber },
  }, {
    orderId: result.orderId,
    transferredBy: ctx.user.id,
    transferredByName: ctx.user.name,
  });

  return result as TransferResult;
}
