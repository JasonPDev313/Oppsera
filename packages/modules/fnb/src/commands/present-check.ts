import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { FNB_EVENTS } from '../events/types';
import type { CheckPresentedPayload } from '../events/types';
import { TabNotFoundError, TabStatusConflictError } from '../errors';
import type { PresentCheckInput } from '../validation';

const PRESENTABLE_STATUSES = ['open', 'ordering', 'sent_to_kitchen', 'in_progress'];

export async function presentCheck(
  ctx: RequestContext,
  locationId: string,
  input: PresentCheckInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'presentCheck');
      if (check.isDuplicate) return { result: check.originalResult as any, events: [] };
    }

    // Fetch tab
    const tabs = await tx.execute(
      sql`SELECT id, status, party_size FROM fnb_tabs
          WHERE id = ${input.tabId} AND tenant_id = ${ctx.tenantId}`,
    );
    const tabRows = Array.from(tabs as Iterable<Record<string, unknown>>);
    if (tabRows.length === 0) throw new TabNotFoundError(input.tabId);

    const tab = tabRows[0]!;
    const currentStatus = tab.status as string;

    if (!PRESENTABLE_STATUSES.includes(currentStatus) && currentStatus !== 'check_presented') {
      throw new TabStatusConflictError(input.tabId, currentStatus, 'present check on');
    }

    // Update tab status to check_presented
    await tx.execute(
      sql`UPDATE fnb_tabs
          SET status = 'check_presented', updated_at = NOW(), version = version + 1
          WHERE id = ${input.tabId} AND tenant_id = ${ctx.tenantId}`,
    );

    const payload: CheckPresentedPayload = {
      tabId: input.tabId,
      orderId: input.orderId,
      locationId,
      totalCents: 0, // will be computed from order total at call site
      seatCount: tab.party_size as number | null,
      perSeat: input.perSeat ?? false,
      presentedBy: ctx.user.id,
    };

    const event = buildEventFromContext(ctx, FNB_EVENTS.CHECK_PRESENTED, payload as unknown as Record<string, unknown>);

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'presentCheck', { tabId: input.tabId });
    }

    return { result: { tabId: input.tabId, status: 'check_presented' }, events: [event] };
  });

  await auditLog(ctx, 'fnb.check.presented', 'fnb_tabs', input.tabId);
  return result;
}
