import { sql, eq, and } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { getPermissionEngine } from '@oppsera/core';
import { fnbTabs } from '@oppsera/db';
import { AppError } from '@oppsera/shared';
import { FNB_EVENTS } from '../events/types';
import type { CheckVoidedPayload } from '../events/types';
import type { VoidCheckInput } from '../validation';

export async function voidCheck(
  ctx: RequestContext,
  locationId: string,
  tabId: string,
  input: VoidCheckInput,
) {
  // Check elevated void permission OUTSIDE the transaction (cached RBAC lookup — fast, non-blocking)
  const engine = getPermissionEngine();
  const hasVoidPermission = await engine.hasPermission(
    ctx.tenantId, ctx.user.id, 'pos_fnb.tabs.void', locationId,
  );

  const result = await publishWithOutbox(ctx, async (tx) => {
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'voidCheck');
      if (check.isDuplicate) return { result: check.originalResult as any, events: [] }; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON from DB
    }

    // Ownership check: verify the current user is the tab's server, or holds the void permission
    const [tab] = await tx
      .select({ serverUserId: fnbTabs.serverUserId })
      .from(fnbTabs)
      .where(and(eq(fnbTabs.id, tabId), eq(fnbTabs.tenantId, ctx.tenantId)));

    if (!tab) {
      throw new AppError('NOT_FOUND', 'Tab not found', 404);
    }

    const isTabOwner = tab.serverUserId === ctx.user.id;

    if (!isTabOwner && !hasVoidPermission) {
      throw new AppError(
        'FORBIDDEN',
        "You can only void your own checks. A supervisor override is required to void another server's check.",
        403,
      );
    }

    // Void the order
    await tx.execute(
      sql`UPDATE orders
          SET status = 'voided', voided_at = NOW(), voided_by = ${ctx.user.id},
              void_reason = ${input.reason}, updated_at = NOW(), version = version + 1
          WHERE id = ${input.orderId} AND tenant_id = ${ctx.tenantId}`,
    );

    const payload: CheckVoidedPayload = {
      orderId: input.orderId,
      tabId,
      locationId,
      reason: input.reason,
      voidedBy: ctx.user.id,
    };

    const event = buildEventFromContext(ctx, FNB_EVENTS.CHECK_VOIDED, payload as unknown as Record<string, unknown>);

    const voidResult = { orderId: input.orderId, status: 'voided' };

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'voidCheck', voidResult);
    }

    return { result: voidResult, events: [event] };
  });

  await auditLog(ctx, 'fnb.check.voided', 'orders', input.orderId);
  return result;
}
