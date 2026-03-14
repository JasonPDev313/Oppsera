import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { FNB_EVENTS } from '../events/types';
import { TabItemNotFoundError, TabItemStatusConflictError } from '../errors';
import type { VoidTabItemInput } from '../validation';

const VOIDABLE_STATUSES = ['draft', 'unsent', 'sent', 'fired', 'served'];

export async function voidTabItem(
  ctx: RequestContext,
  tabId: string,
  itemId: string,
  input: VoidTabItemInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'voidTabItem');
      if (check.isDuplicate) return { result: check.originalResult as Record<string, unknown>, events: [] };
    }

    const rows = await tx.execute(
      sql`SELECT id, tab_id, status, unit_price_cents, qty, catalog_item_name
          FROM fnb_tab_items
          WHERE id = ${itemId} AND tab_id = ${tabId} AND tenant_id = ${ctx.tenantId}
          LIMIT 1`,
    );
    const items = Array.from(rows as Iterable<Record<string, unknown>>);
    if (items.length === 0) throw new TabItemNotFoundError(itemId);

    const item = items[0]!;
    if (!VOIDABLE_STATUSES.includes(item.status as string)) {
      throw new TabItemStatusConflictError(itemId, item.status as string, 'void');
    }

    const [updated] = await tx.execute(
      sql`UPDATE fnb_tab_items
          SET status = 'voided',
              voided_at = NOW(),
              voided_by = ${ctx.user.id},
              void_reason = ${input.reason},
              updated_at = NOW()
          WHERE id = ${itemId} AND tenant_id = ${ctx.tenantId}
          RETURNING *`,
    );

    const event = buildEventFromContext(ctx, FNB_EVENTS.TAB_ITEM_VOIDED, {
      tabId,
      itemId,
      locationId: ctx.locationId,
      reason: input.reason,
      voidedBy: ctx.user.id,
    });

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'voidTabItem', updated as Record<string, unknown>);
    }

    return { result: updated as Record<string, unknown>, events: [event] };
  });

  auditLogDeferred(ctx, 'fnb.tab_item.voided', 'fnb_tab_items', itemId);
  return result;
}
