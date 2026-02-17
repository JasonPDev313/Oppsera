import { eq, and, lt, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { paymentJournalEntries } from '@oppsera/db';

type JournalEntry = typeof paymentJournalEntries.$inferSelect;

export interface GetJournalInput {
  tenantId: string;
  locationId?: string;
  businessDate?: string;
  orderId?: string;
  postingStatus?: string;
  cursor?: string;
  limit?: number;
}

export interface GetJournalResult {
  entries: JournalEntry[];
  cursor: string | null;
  hasMore: boolean;
}

export async function getPaymentJournalEntries(input: GetJournalInput): Promise<GetJournalResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof eq>[] = [eq(paymentJournalEntries.tenantId, input.tenantId)];

    if (input.locationId) conditions.push(eq(paymentJournalEntries.locationId, input.locationId));
    if (input.businessDate) conditions.push(eq(paymentJournalEntries.businessDate, input.businessDate));
    if (input.orderId) conditions.push(eq(paymentJournalEntries.orderId, input.orderId));
    if (input.postingStatus) conditions.push(eq(paymentJournalEntries.postingStatus, input.postingStatus));
    if (input.cursor) conditions.push(lt(paymentJournalEntries.id, input.cursor));

    const rows = await tx.select().from(paymentJournalEntries)
      .where(and(...conditions))
      .orderBy(desc(paymentJournalEntries.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return {
      entries: items,
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}
