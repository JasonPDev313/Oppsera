/**
 * List message log entries with optional filters.
 */
import { and, eq, desc, type SQL } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { pmsMessageLog } from '@oppsera/db';

export interface MessageLogItem {
  id: string;
  propertyId: string;
  reservationId: string | null;
  guestId: string | null;
  channel: string;
  direction: string;
  messageType: string;
  subject: string | null;
  body: string;
  recipient: string | null;
  status: string;
  sentAt: string | null;
  externalId: string | null;
  createdAt: string;
  createdBy: string | null;
}

export interface ListMessageLogInput {
  reservationId?: string;
  guestId?: string;
  channel?: string;
  cursor?: string;
  limit?: number;
}

export interface ListMessageLogResult {
  items: MessageLogItem[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listMessageLog(
  tenantId: string,
  propertyId: string,
  filters: ListMessageLogInput = {},
): Promise<ListMessageLogResult> {
  const limit = filters.limit ?? 50;

  return withTenant(tenantId, async (tx) => {
    const conditions: SQL[] = [
      eq(pmsMessageLog.tenantId, tenantId),
      eq(pmsMessageLog.propertyId, propertyId),
    ];

    if (filters.reservationId) {
      conditions.push(eq(pmsMessageLog.reservationId, filters.reservationId));
    }
    if (filters.guestId) {
      conditions.push(eq(pmsMessageLog.guestId, filters.guestId));
    }
    if (filters.channel) {
      conditions.push(eq(pmsMessageLog.channel, filters.channel));
    }

    const rows = await tx
      .select()
      .from(pmsMessageLog)
      .where(and(...conditions))
      .orderBy(desc(pmsMessageLog.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return {
      items: items.map((r) => ({
        id: r.id,
        propertyId: r.propertyId,
        reservationId: r.reservationId,
        guestId: r.guestId,
        channel: r.channel,
        direction: r.direction,
        messageType: r.messageType,
        subject: r.subject,
        body: r.body,
        recipient: r.recipient,
        status: r.status,
        sentAt: r.sentAt ? r.sentAt.toISOString() : null,
        externalId: r.externalId,
        createdAt: r.createdAt.toISOString(),
        createdBy: r.createdBy,
      })),
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}
