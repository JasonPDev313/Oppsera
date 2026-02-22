import { eq, and, desc, lt, gte, lte, type SQL } from 'drizzle-orm';
import { retailCloseBatches } from '@oppsera/db';
import { withTenant } from '@oppsera/db';
import type { RetailCloseBatch, TenderBreakdownEntry, DepartmentSalesEntry, TaxGroupEntry } from '../types';

function mapRow(row: typeof retailCloseBatches.$inferSelect): RetailCloseBatch {
  return {
    id: row.id,
    tenantId: row.tenantId,
    locationId: row.locationId,
    terminalId: row.terminalId,
    businessDate: row.businessDate,
    drawerSessionId: row.drawerSessionId,
    status: row.status as RetailCloseBatch['status'],
    grossSalesCents: row.grossSalesCents,
    netSalesCents: row.netSalesCents,
    taxCollectedCents: row.taxCollectedCents,
    discountTotalCents: row.discountTotalCents,
    voidTotalCents: row.voidTotalCents,
    voidCount: row.voidCount,
    serviceChargeCents: row.serviceChargeCents,
    tipsCreditCents: row.tipsCreditCents,
    tipsCashCents: row.tipsCashCents,
    orderCount: row.orderCount,
    refundTotalCents: row.refundTotalCents,
    refundCount: row.refundCount,
    tenderBreakdown: (row.tenderBreakdown ?? []) as TenderBreakdownEntry[],
    salesByDepartment: row.salesByDepartment as DepartmentSalesEntry[] | null,
    taxByGroup: row.taxByGroup as TaxGroupEntry[] | null,
    cashExpectedCents: row.cashExpectedCents,
    cashCountedCents: row.cashCountedCents,
    cashOverShortCents: row.cashOverShortCents,
    startedAt: row.startedAt?.toISOString() ?? null,
    startedBy: row.startedBy,
    reconciledAt: row.reconciledAt?.toISOString() ?? null,
    reconciledBy: row.reconciledBy,
    postedAt: row.postedAt?.toISOString() ?? null,
    postedBy: row.postedBy,
    lockedAt: row.lockedAt?.toISOString() ?? null,
    lockedBy: row.lockedBy,
    glJournalEntryId: row.glJournalEntryId,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

interface ListRetailCloseBatchesInput {
  tenantId: string;
  locationId?: string;
  terminalId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  cursor?: string;
  limit?: number;
}

export async function listRetailCloseBatches(
  input: ListRetailCloseBatchesInput,
): Promise<{ items: RetailCloseBatch[]; cursor: string | null; hasMore: boolean }> {
  const limit = input.limit ?? 25;

  return withTenant(input.tenantId, async (tx) => {
    const conditions: SQL[] = [eq(retailCloseBatches.tenantId, input.tenantId)];

    if (input.locationId) {
      conditions.push(eq(retailCloseBatches.locationId, input.locationId));
    }
    if (input.terminalId) {
      conditions.push(eq(retailCloseBatches.terminalId, input.terminalId));
    }
    if (input.status) {
      conditions.push(eq(retailCloseBatches.status, input.status));
    }
    if (input.dateFrom) {
      conditions.push(gte(retailCloseBatches.businessDate, input.dateFrom));
    }
    if (input.dateTo) {
      conditions.push(lte(retailCloseBatches.businessDate, input.dateTo));
    }
    if (input.cursor) {
      conditions.push(lt(retailCloseBatches.id, input.cursor));
    }

    const rows = await tx
      .select()
      .from(retailCloseBatches)
      .where(and(...conditions))
      .orderBy(desc(retailCloseBatches.businessDate), desc(retailCloseBatches.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return {
      items: items.map(mapRow),
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}
