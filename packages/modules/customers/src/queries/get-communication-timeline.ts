import { eq, and, lt, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { customerCommunications } from '@oppsera/db';

export interface GetCommunicationTimelineInput {
  tenantId: string;
  customerId: string;
  channel?: string;
  direction?: string;
  cursor?: string;
  limit?: number;
}

export interface CommunicationTimelineItem {
  id: string;
  customerId: string;
  channel: string;
  direction: string;
  subject: string | null;
  body: string | null;
  status: string;
  sentAt: Date | null;
  metaJson: unknown;
  metadata: unknown;
  createdAt: Date;
  createdBy: string | null;
}

export interface GetCommunicationTimelineResult {
  items: CommunicationTimelineItem[];
  cursor: string | null;
  hasMore: boolean;
}

export async function getCommunicationTimeline(
  input: GetCommunicationTimelineInput,
): Promise<GetCommunicationTimelineResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      eq(customerCommunications.tenantId, input.tenantId),
      eq(customerCommunications.customerId, input.customerId),
    ];

    if (input.channel) {
      conditions.push(eq(customerCommunications.channel, input.channel));
    }

    if (input.direction) {
      conditions.push(eq(customerCommunications.direction, input.direction));
    }

    if (input.cursor) {
      conditions.push(lt(customerCommunications.id, input.cursor));
    }

    const rows = await tx
      .select()
      .from(customerCommunications)
      .where(and(...conditions))
      .orderBy(desc(customerCommunications.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items: CommunicationTimelineItem[] = (hasMore ? rows.slice(0, limit) : rows).map((row) => ({
      id: row.id,
      customerId: row.customerId,
      channel: row.channel,
      direction: row.direction,
      subject: row.subject,
      body: row.body,
      status: row.status,
      sentAt: row.sentAt,
      metaJson: row.metaJson,
      metadata: row.metadata,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
    }));
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;

    return { items, cursor: nextCursor, hasMore };
  });
}
