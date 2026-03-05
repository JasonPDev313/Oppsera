import { eq, and, desc, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { customerCommunications } from '@oppsera/db';

function encodeCursor(...parts: string[]): string {
  return parts.join('|');
}

function decodeCursor(cursor: string, expectedParts: number): string[] | null {
  const parts = cursor.split('|');
  if (parts.length !== expectedParts) return null; // Legacy fallback
  return parts;
}

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
      const decoded = decodeCursor(input.cursor, 2);
      if (decoded) {
        const [cursorCreatedAt, cursorId] = decoded as [string, string];
        conditions.push(
          sql`(${customerCommunications.createdAt}, ${customerCommunications.id}) < (${cursorCreatedAt}::timestamptz, ${cursorId})` as unknown as ReturnType<typeof eq>,
        );
      } else {
        // Legacy: cursor was plain id
        conditions.push(
          sql`${customerCommunications.id} < ${input.cursor}` as unknown as ReturnType<typeof eq>,
        );
      }
    }

    const rows = await tx
      .select()
      .from(customerCommunications)
      .where(and(...conditions))
      .orderBy(desc(customerCommunications.createdAt), desc(customerCommunications.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    const items: CommunicationTimelineItem[] = sliced.map((row) => ({
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

    const lastItem = sliced[sliced.length - 1];
    const nextCursor = hasMore && lastItem
      ? encodeCursor(lastItem.createdAt.toISOString(), lastItem.id)
      : null;

    return { items, cursor: nextCursor, hasMore };
  });
}
