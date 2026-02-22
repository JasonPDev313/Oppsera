import { eq, and } from 'drizzle-orm';
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

export async function getRetailCloseBatch(input: {
  tenantId: string;
  batchId: string;
}): Promise<RetailCloseBatch | null> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(retailCloseBatches)
      .where(
        and(
          eq(retailCloseBatches.id, input.batchId),
          eq(retailCloseBatches.tenantId, input.tenantId),
        ),
      );

    if (rows.length === 0) return null;
    return mapRow(rows[0]!);
  });
}

export async function getRetailCloseBatchByTerminalDate(input: {
  tenantId: string;
  terminalId: string;
  businessDate: string;
}): Promise<RetailCloseBatch | null> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(retailCloseBatches)
      .where(
        and(
          eq(retailCloseBatches.tenantId, input.tenantId),
          eq(retailCloseBatches.terminalId, input.terminalId),
          eq(retailCloseBatches.businessDate, input.businessDate),
        ),
      );

    if (rows.length === 0) return null;
    return mapRow(rows[0]!);
  });
}
