/**
 * List Tag Actions Query
 *
 * Returns all actions configured for a specific tag, ordered by execution_order.
 */

import { eq, and, asc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { tagActions } from '@oppsera/db';

export interface ListTagActionsInput {
  tenantId: string;
  tagId: string;
  trigger?: 'on_apply' | 'on_remove' | 'on_expire';
}

export interface TagActionItem {
  id: string;
  tagId: string;
  trigger: string;
  actionType: string;
  config: Record<string, unknown>;
  isActive: boolean;
  executionOrder: number;
  createdAt: string;
  updatedAt: string;
}

export async function listTagActions(
  input: ListTagActionsInput,
): Promise<TagActionItem[]> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      eq(tagActions.tenantId, input.tenantId),
      eq(tagActions.tagId, input.tagId),
    ];

    if (input.trigger) {
      conditions.push(eq(tagActions.trigger, input.trigger));
    }

    const rows = await tx
      .select({
        id: tagActions.id,
        tagId: tagActions.tagId,
        trigger: tagActions.trigger,
        actionType: tagActions.actionType,
        config: tagActions.config,
        isActive: tagActions.isActive,
        executionOrder: tagActions.executionOrder,
        createdAt: tagActions.createdAt,
        updatedAt: tagActions.updatedAt,
      })
      .from(tagActions)
      .where(and(...conditions))
      .orderBy(asc(tagActions.executionOrder));

    return rows.map((r) => ({
      id: r.id,
      tagId: r.tagId,
      trigger: r.trigger,
      actionType: r.actionType,
      config: (r.config as Record<string, unknown>) ?? {},
      isActive: r.isActive,
      executionOrder: r.executionOrder,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
    }));
  });
}
