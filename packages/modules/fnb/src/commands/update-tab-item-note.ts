import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { withTenant } from '@oppsera/db';
import { TabItemNotFoundError } from '../errors';
import type { UpdateTabItemNoteInput } from '../validation';

export async function updateTabItemNote(
  ctx: RequestContext,
  tabId: string,
  itemId: string,
  input: UpdateTabItemNoteInput,
) {
  const result = await withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx.execute(
      sql`SELECT id FROM fnb_tab_items
          WHERE id = ${itemId} AND tab_id = ${tabId} AND tenant_id = ${ctx.tenantId}
          LIMIT 1`,
    );
    const items = Array.from(rows as Iterable<Record<string, unknown>>);
    if (items.length === 0) throw new TabItemNotFoundError(itemId);

    const [updated] = await tx.execute(
      sql`UPDATE fnb_tab_items
          SET special_instructions = ${input.specialInstructions},
              updated_at = NOW()
          WHERE id = ${itemId} AND tenant_id = ${ctx.tenantId}
          RETURNING *`,
    );

    return updated as Record<string, unknown>;
  });

  auditLogDeferred(ctx, 'fnb.tab_item.note_updated', 'fnb_tab_items', itemId);
  return result;
}
