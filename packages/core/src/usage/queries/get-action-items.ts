/**
 * Action Items — list, filter, and update usage action items.
 */
import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import { usageActionItems } from '@oppsera/db';
import { eq } from 'drizzle-orm';

export interface ActionItemFilters {
  status?: 'open' | 'reviewed' | 'actioned' | 'dismissed';
  category?: string;
  severity?: string;
  limit?: number;
  cursor?: string;
}

export interface ActionItemRow {
  id: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  tenantId: string | null;
  moduleKey: string | null;
  metadata: Record<string, unknown>;
  status: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActionItemsResult {
  items: ActionItemRow[];
  stats: { open: number; reviewed: number; actioned: number; dismissed: number };
  cursor: string | null;
  hasMore: boolean;
}

export async function getActionItems(filters: ActionItemFilters = {}): Promise<ActionItemsResult> {
  const limit = filters.limit || 50;

  // ── Build conditions ───────────────────────────────────
  const conditions: ReturnType<typeof sql>[] = [];
  if (filters.status) {
    conditions.push(sql`status = ${filters.status}`);
  }
  if (filters.category) {
    conditions.push(sql`category = ${filters.category}`);
  }
  if (filters.severity) {
    conditions.push(sql`severity = ${filters.severity}`);
  }
  if (filters.cursor) {
    conditions.push(sql`id < ${filters.cursor}`);
  }
  // Exclude expired
  conditions.push(sql`(expires_at IS NULL OR expires_at > NOW())`);

  const whereClause =
    conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

  // ── Items + stats in parallel ──────────────────────────
  const [itemRows, statsRows] = await Promise.all([
    db.execute(sql`
      SELECT * FROM usage_action_items
      ${whereClause}
      ORDER BY
        CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
        created_at DESC
      LIMIT ${limit + 1}
    `),
    db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'open')::int AS open,
        COUNT(*) FILTER (WHERE status = 'reviewed')::int AS reviewed,
        COUNT(*) FILTER (WHERE status = 'actioned')::int AS actioned,
        COUNT(*) FILTER (WHERE status = 'dismissed')::int AS dismissed
      FROM usage_action_items
      WHERE expires_at IS NULL OR expires_at > NOW()
    `),
  ]);

  const allItems = Array.from(itemRows as Iterable<Record<string, unknown>>);
  const hasMore = allItems.length > limit;
  const items = hasMore ? allItems.slice(0, limit) : allItems;
  const stat = Array.from(statsRows as Iterable<Record<string, unknown>>)[0] || {};

  return {
    items: items.map((r) => ({
      id: String(r.id),
      category: String(r.category),
      severity: String(r.severity),
      title: String(r.title),
      description: String(r.description),
      tenantId: r.tenant_id ? String(r.tenant_id) : null,
      moduleKey: r.module_key ? String(r.module_key) : null,
      metadata: (r.metadata as Record<string, unknown>) || {},
      status: String(r.status),
      reviewedBy: r.reviewed_by ? String(r.reviewed_by) : null,
      reviewedAt: r.reviewed_at ? String(r.reviewed_at) : null,
      reviewNotes: r.review_notes ? String(r.review_notes) : null,
      expiresAt: r.expires_at ? String(r.expires_at) : null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    })),
    stats: {
      open: Number(stat.open ?? 0),
      reviewed: Number(stat.reviewed ?? 0),
      actioned: Number(stat.actioned ?? 0),
      dismissed: Number(stat.dismissed ?? 0),
    },
    cursor: hasMore && items.length > 0 ? String(items[items.length - 1]!.id) : null,
    hasMore,
  };
}

export async function updateActionItemStatus(
  id: string,
  status: 'reviewed' | 'actioned' | 'dismissed',
  reviewedBy: string,
  reviewNotes?: string,
): Promise<void> {
  await db
    .update(usageActionItems)
    .set({
      status,
      reviewedBy,
      reviewedAt: new Date(),
      reviewNotes: reviewNotes || null,
      updatedAt: new Date(),
    })
    .where(eq(usageActionItems.id, id));
}
