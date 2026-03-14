import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { FNB_EVENTS } from '../events/types';
import { TabItemNotFoundError, TabItemStatusConflictError } from '../errors';
import type { CompTabItemInput } from '../validation';

const COMPABLE_STATUSES = ['draft', 'unsent', 'sent', 'fired', 'served'];

export async function compTabItem(
  ctx: RequestContext,
  tabId: string,
  itemId: string,
  input: CompTabItemInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'compTabItem');
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
    if (!COMPABLE_STATUSES.includes(item.status as string)) {
      throw new TabItemStatusConflictError(itemId, item.status as string, 'comp');
    }

    const originalPriceCents = Number(item.unit_price_cents);
    const qty = Number(item.qty);
    const compAmountCents = originalPriceCents * qty;

    // Zero out the line price
    const [updated] = await tx.execute(
      sql`UPDATE fnb_tab_items
          SET unit_price_cents = 0,
              extended_price_cents = 0,
              updated_at = NOW()
          WHERE id = ${itemId} AND tenant_id = ${ctx.tenantId}
          RETURNING *`,
    );

    // Record comp event for reporting
    await tx.execute(
      sql`INSERT INTO comp_events (
            tenant_id, location_id, order_id, order_line_id,
            comp_type, amount_cents, reason, comp_category,
            approved_by, business_date
          )
          VALUES (
            ${ctx.tenantId}, ${ctx.locationId ?? null}, ${tabId}, ${itemId},
            'item', ${compAmountCents}, ${input.reason},
            ${input.compCategory ?? 'manager'}, ${ctx.user.name ?? ctx.user.id},
            CURRENT_DATE
          )`,
    );

    const event = buildEventFromContext(ctx, FNB_EVENTS.TAB_ITEM_COMPED, {
      tabId,
      itemId,
      locationId: ctx.locationId,
      compAmountCents,
      reason: input.reason,
      compCategory: input.compCategory,
      compedBy: ctx.user.id,
    });

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'compTabItem', updated as Record<string, unknown>);
    }

    return { result: updated as Record<string, unknown>, events: [event] };
  });

  auditLogDeferred(ctx, 'fnb.tab_item.comped', 'fnb_tab_items', itemId);
  return result;
}
