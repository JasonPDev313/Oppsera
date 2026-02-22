import { eq, and, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { customerActivityLog, customerCommunications } from '@oppsera/db';

export interface GetCustomerActivityFeedInput {
  tenantId: string;
  customerId: string;
  cursor?: string;
  limit?: number;
}

export interface ActivityFeedItem {
  id: string;
  source: 'activity_log' | 'communication';
  type: string;
  title: string;
  details: string | null;
  createdAt: Date;
  createdBy: string | null;
  metadata: Record<string, unknown> | null;
}

export interface GetCustomerActivityFeedResult {
  items: ActivityFeedItem[];
  cursor: string | null;
  hasMore: boolean;
}

export async function getCustomerActivityFeed(
  input: GetCustomerActivityFeedInput,
): Promise<GetCustomerActivityFeedResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    // Fetch activity log entries
    const activityConditions = [
      eq(customerActivityLog.tenantId, input.tenantId),
      eq(customerActivityLog.customerId, input.customerId),
    ];

    const activityRows = await tx
      .select({
        id: customerActivityLog.id,
        type: customerActivityLog.activityType,
        title: customerActivityLog.title,
        details: customerActivityLog.details,
        createdAt: customerActivityLog.createdAt,
        createdBy: customerActivityLog.createdBy,
        metadata: customerActivityLog.metadata,
      })
      .from(customerActivityLog)
      .where(and(...activityConditions))
      .orderBy(desc(customerActivityLog.createdAt))
      .limit(limit + 1);

    // Fetch communication entries
    const commConditions = [
      eq(customerCommunications.tenantId, input.tenantId),
      eq(customerCommunications.customerId, input.customerId),
    ];

    const commRows = await tx
      .select({
        id: customerCommunications.id,
        channel: customerCommunications.channel,
        direction: customerCommunications.direction,
        subject: customerCommunications.subject,
        body: customerCommunications.body,
        createdAt: customerCommunications.createdAt,
        createdBy: customerCommunications.createdBy,
        metadata: customerCommunications.metadata,
      })
      .from(customerCommunications)
      .where(and(...commConditions))
      .orderBy(desc(customerCommunications.createdAt))
      .limit(limit + 1);

    // Map to unified feed items
    const activityItems: ActivityFeedItem[] = activityRows.map((row) => ({
      id: row.id,
      source: 'activity_log' as const,
      type: row.type,
      title: row.title,
      details: row.details,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
      metadata: row.metadata as Record<string, unknown> | null,
    }));

    const commItems: ActivityFeedItem[] = commRows.map((row) => ({
      id: row.id,
      source: 'communication' as const,
      type: `${row.channel}_${row.direction}`,
      title: row.subject ?? `${row.channel} ${row.direction}`,
      details: row.body,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
      metadata: row.metadata as Record<string, unknown> | null,
    }));

    // Merge and sort by createdAt DESC, then take limit + 1
    const allItems = [...activityItems, ...commItems]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Apply cursor-based filtering if cursor provided
    let filtered = allItems;
    if (input.cursor) {
      const cursorIdx = filtered.findIndex((item) => item.id === input.cursor);
      if (cursorIdx >= 0) {
        filtered = filtered.slice(cursorIdx + 1);
      }
    }

    const hasMore = filtered.length > limit;
    const items = hasMore ? filtered.slice(0, limit) : filtered;
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;

    return { items, cursor: nextCursor, hasMore };
  });
}
