import { eq, and, desc, sql } from 'drizzle-orm';
import { withTenant, depositSlips } from '@oppsera/db';
import type { DenominationBreakdown } from '@oppsera/core/drawer-sessions/types';
import type { DepositSlip } from '../commands/manage-deposit-slips';

export interface ListDepositSlipsInput {
  tenantId: string;
  locationId?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}

function mapRow(row: typeof depositSlips.$inferSelect): DepositSlip {
  return {
    id: row.id,
    tenantId: row.tenantId,
    locationId: row.locationId,
    businessDate: row.businessDate,
    depositType: row.depositType,
    totalAmountCents: row.totalAmountCents,
    bankAccountId: row.bankAccountId,
    status: row.status,
    retailCloseBatchIds: (row.retailCloseBatchIds as string[]) ?? [],
    fnbCloseBatchId: row.fnbCloseBatchId,
    denominationBreakdown: (row.denominationBreakdown as DenominationBreakdown) ?? null,
    slipNumber: row.slipNumber,
    preparedBy: row.preparedBy,
    preparedAt: row.preparedAt?.toISOString() ?? null,
    depositedAt: row.depositedAt?.toISOString() ?? null,
    depositedBy: row.depositedBy,
    reconciledAt: row.reconciledAt?.toISOString() ?? null,
    reconciledBy: row.reconciledBy,
    glJournalEntryId: row.glJournalEntryId,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listDepositSlips(
  input: ListDepositSlipsInput,
): Promise<{ items: DepositSlip[]; cursor: string | null; hasMore: boolean }> {
  const limit = input.limit ?? 50;

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [eq(depositSlips.tenantId, input.tenantId)];

    if (input.locationId) {
      conditions.push(eq(depositSlips.locationId, input.locationId));
    }
    if (input.status) {
      conditions.push(eq(depositSlips.status, input.status));
    }
    if (input.cursor) {
      conditions.push(sql`${depositSlips.id} < ${input.cursor}`);
    }

    const rows = await tx
      .select()
      .from(depositSlips)
      .where(and(...conditions))
      .orderBy(desc(depositSlips.businessDate), desc(depositSlips.id))
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

export async function getDepositSlip(
  tenantId: string,
  depositSlipId: string,
): Promise<DepositSlip | null> {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(depositSlips)
      .where(and(eq(depositSlips.id, depositSlipId), eq(depositSlips.tenantId, tenantId)))
      .limit(1);

    return row ? mapRow(row) : null;
  });
}
