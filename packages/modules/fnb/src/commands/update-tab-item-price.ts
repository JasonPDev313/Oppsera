import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { FNB_EVENTS } from '../events/types';
import { TabItemNotFoundError, TabItemStatusConflictError } from '../errors';
import type { UpdateTabItemPriceInput } from '../validation';

const PRICE_EDITABLE_STATUSES = ['draft', 'unsent', 'sent'];

export async function updateTabItemPrice(
  ctx: RequestContext,
  tabId: string,
  itemId: string,
  input: UpdateTabItemPriceInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'updateTabItemPrice');
      if (check.isDuplicate) return { result: check.originalResult as Record<string, unknown>, events: [] };
    }

    const rows = await tx.execute(
      sql`SELECT id, tab_id, status, unit_price_cents, qty
          FROM fnb_tab_items
          WHERE id = ${itemId} AND tab_id = ${tabId} AND tenant_id = ${ctx.tenantId}
          LIMIT 1`,
    );
    const items = Array.from(rows as Iterable<Record<string, unknown>>);
    if (items.length === 0) throw new TabItemNotFoundError(itemId);

    const item = items[0]!;
    if (!PRICE_EDITABLE_STATUSES.includes(item.status as string)) {
      throw new TabItemStatusConflictError(itemId, item.status as string, 'change price of');
    }

    const oldPriceCents = Number(item.unit_price_cents);
    const qty = Number(item.qty);
    const newExtended = Math.round(input.newPriceCents * qty);

    const [updated] = await tx.execute(
      sql`UPDATE fnb_tab_items
          SET unit_price_cents = ${input.newPriceCents},
              extended_price_cents = ${newExtended},
              updated_at = NOW()
          WHERE id = ${itemId} AND tenant_id = ${ctx.tenantId}
          RETURNING *`,
    );

    const event = buildEventFromContext(ctx, FNB_EVENTS.TAB_ITEM_PRICE_CHANGED, {
      tabId,
      itemId,
      locationId: ctx.locationId,
      oldPriceCents,
      newPriceCents: input.newPriceCents,
      reason: input.reason,
      changedBy: ctx.user.id,
    });

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'updateTabItemPrice', updated as Record<string, unknown>);
    }

    return { result: updated as Record<string, unknown>, events: [event] };
  });

  auditLogDeferred(ctx, 'fnb.tab_item.price_changed', 'fnb_tab_items', itemId);
  return result;
}
