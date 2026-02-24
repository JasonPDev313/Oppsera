import { eq, and, desc, lt } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { periodicCogsCalculations } from '@oppsera/db';
import type { ListPeriodicCogsInput } from '../validation';

export interface PeriodicCogsListItem {
  id: string;
  locationId: string | null;
  periodStart: string;
  periodEnd: string;
  status: string;
  calculationMethod: string;
  beginningInventoryDollars: string;
  purchasesDollars: string;
  endingInventoryDollars: string;
  cogsDollars: string;
  glJournalEntryId: string | null;
  calculatedAt: string;
  postedAt: string | null;
  postedBy: string | null;
}

export interface ListPeriodicCogsResult {
  items: PeriodicCogsListItem[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listPeriodicCogs(
  tenantId: string,
  input: ListPeriodicCogsInput,
): Promise<ListPeriodicCogsResult> {
  const limit = input.limit ?? 50;

  return withTenant(tenantId, async (tx) => {
    const conditions = [eq(periodicCogsCalculations.tenantId, tenantId)];

    if (input.locationId) {
      conditions.push(eq(periodicCogsCalculations.locationId, input.locationId));
    }

    if (input.status) {
      conditions.push(eq(periodicCogsCalculations.status, input.status));
    }

    if (input.cursor) {
      conditions.push(lt(periodicCogsCalculations.id, input.cursor));
    }

    const rows = await tx
      .select()
      .from(periodicCogsCalculations)
      .where(and(...conditions))
      .orderBy(desc(periodicCogsCalculations.periodEnd), desc(periodicCogsCalculations.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return {
      items: items.map((row) => ({
        id: row.id,
        locationId: row.locationId,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        status: row.status,
        calculationMethod: row.calculationMethod,
        beginningInventoryDollars: row.beginningInventoryDollars,
        purchasesDollars: row.purchasesDollars,
        endingInventoryDollars: row.endingInventoryDollars,
        cogsDollars: row.cogsDollars,
        glJournalEntryId: row.glJournalEntryId,
        calculatedAt: row.calculatedAt.toISOString(),
        postedAt: row.postedAt?.toISOString() ?? null,
        postedBy: row.postedBy,
      })),
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}
