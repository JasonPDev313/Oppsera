import { eq, and, desc } from 'drizzle-orm';
import { compEvents } from '@oppsera/db';
import { withTenant } from '@oppsera/db';
import type { CompEvent } from '../types';

function mapRow(row: typeof compEvents.$inferSelect): CompEvent {
  return {
    id: row.id,
    tenantId: row.tenantId,
    locationId: row.locationId,
    orderId: row.orderId,
    orderLineId: row.orderLineId,
    compType: row.compType as CompEvent['compType'],
    amountCents: row.amountCents,
    reason: row.reason,
    compCategory: row.compCategory as CompEvent['compCategory'],
    approvedBy: row.approvedBy,
    glJournalEntryId: row.glJournalEntryId,
    businessDate: row.businessDate,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getCompsByOrder(input: {
  tenantId: string;
  orderId: string;
}): Promise<CompEvent[]> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(compEvents)
      .where(
        and(
          eq(compEvents.tenantId, input.tenantId),
          eq(compEvents.orderId, input.orderId),
        ),
      )
      .orderBy(desc(compEvents.createdAt));

    return rows.map(mapRow);
  });
}
