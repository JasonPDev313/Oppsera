import { eq, and, lt, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { tenders, tenderReversals } from '@oppsera/db';

type Tender = typeof tenders.$inferSelect;

export interface ListTendersInput {
  tenantId: string;
  locationId?: string;
  businessDate?: string;
  tenderType?: string;
  employeeId?: string;
  terminalId?: string;
  shiftId?: string;
  cursor?: string;
  limit?: number;
}

export interface ListTendersResult {
  tenders: Array<Tender & { isReversed: boolean }>;
  cursor: string | null;
  hasMore: boolean;
}

export async function listTenders(input: ListTendersInput): Promise<ListTendersResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof eq>[] = [eq(tenders.tenantId, input.tenantId)];

    if (input.locationId) conditions.push(eq(tenders.locationId, input.locationId));
    if (input.businessDate) conditions.push(eq(tenders.businessDate, input.businessDate));
    if (input.tenderType) conditions.push(eq(tenders.tenderType, input.tenderType));
    if (input.employeeId) conditions.push(eq(tenders.employeeId, input.employeeId));
    if (input.terminalId) conditions.push(eq(tenders.terminalId, input.terminalId));
    if (input.shiftId) conditions.push(eq(tenders.shiftId, input.shiftId));
    if (input.cursor) conditions.push(lt(tenders.id, input.cursor));

    const rows = await tx.select().from(tenders).where(and(...conditions))
      .orderBy(desc(tenders.id)).limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    // Check for reversals
    const tenderIds = items.map(t => t.id);
    let reversedIds = new Set<string>();
    if (tenderIds.length > 0) {
      const { inArray } = await import('drizzle-orm');
      const reversals = await tx.select().from(tenderReversals).where(
        and(
          eq(tenderReversals.tenantId, input.tenantId),
          eq(tenderReversals.status, 'completed'),
          inArray(tenderReversals.originalTenderId, tenderIds),
        ),
      );
      reversedIds = new Set(reversals.map(r => r.originalTenderId));
    }

    const enriched = items.map(t => ({ ...t, isReversed: reversedIds.has(t.id) }));

    return {
      tenders: enriched,
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}
