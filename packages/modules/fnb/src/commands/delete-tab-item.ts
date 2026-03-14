import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { FNB_EVENTS } from '../events/types';
import { TabItemNotFoundError, TabItemStatusConflictError } from '../errors';

const DELETABLE_STATUSES = ['draft', 'unsent'];

export async function deleteTabItem(
  ctx: RequestContext,
  tabId: string,
  itemId: string,
) {
  await publishWithOutbox(ctx, async (tx) => {
    const rows = await tx.execute(
      sql`SELECT id, status, catalog_item_name, course_number
          FROM fnb_tab_items
          WHERE id = ${itemId} AND tab_id = ${tabId} AND tenant_id = ${ctx.tenantId}
          LIMIT 1`,
    );
    const items = Array.from(rows as Iterable<Record<string, unknown>>);
    if (items.length === 0) throw new TabItemNotFoundError(itemId);

    const item = items[0]!;
    if (!DELETABLE_STATUSES.includes(item.status as string)) {
      throw new TabItemStatusConflictError(itemId, item.status as string, 'delete');
    }

    await tx.execute(
      sql`DELETE FROM fnb_tab_items
          WHERE id = ${itemId} AND tenant_id = ${ctx.tenantId}`,
    );

    const event = buildEventFromContext(ctx, FNB_EVENTS.TAB_ITEM_DELETED, {
      tabId,
      itemId,
      locationId: ctx.locationId,
      catalogItemName: item.catalog_item_name,
      courseNumber: item.course_number,
    });

    return { result: { deleted: true }, events: [event] };
  });

  auditLogDeferred(ctx, 'fnb.tab_item.deleted', 'fnb_tab_items', itemId);
}
