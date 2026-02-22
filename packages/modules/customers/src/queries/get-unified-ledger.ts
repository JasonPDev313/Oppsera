import { eq, and, lt, desc, gte, lte } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { arTransactions, billingAccounts } from '@oppsera/db';

export interface GetUnifiedLedgerInput {
  tenantId: string;
  customerId: string;
  accountId?: string;
  dateFrom?: string;
  dateTo?: string;
  type?: string;
  status?: string;
  sourceModule?: string;
  locationId?: string;
  limit?: number;
  cursor?: string;
}

export interface UnifiedLedgerEntry {
  id: string;
  type: string;
  amountCents: number;
  notes: string | null;
  status: string;
  sourceModule: string | null;
  businessDate: string | null;
  locationId: string | null;
  departmentId: string | null;
  createdAt: string;
  accountName: string;
  accountId: string;
  metaJson: unknown;
}

export interface UnifiedLedgerResult {
  transactions: UnifiedLedgerEntry[];
  cursor: string | null;
  hasMore: boolean;
}

export async function getUnifiedLedger(
  input: GetUnifiedLedgerInput,
): Promise<UnifiedLedgerResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof eq>[] = [
      eq(arTransactions.tenantId, input.tenantId),
      eq(arTransactions.customerId, input.customerId),
    ];

    if (input.accountId) {
      conditions.push(eq(arTransactions.billingAccountId, input.accountId));
    }

    if (input.type) {
      conditions.push(eq(arTransactions.type, input.type));
    }

    if (input.status) {
      conditions.push(eq(arTransactions.status, input.status));
    }

    if (input.sourceModule) {
      conditions.push(eq(arTransactions.sourceModule, input.sourceModule));
    }

    if (input.locationId) {
      conditions.push(eq(arTransactions.locationId, input.locationId));
    }

    if (input.dateFrom) {
      conditions.push(gte(arTransactions.createdAt, new Date(input.dateFrom)));
    }

    if (input.dateTo) {
      conditions.push(lte(arTransactions.createdAt, new Date(input.dateTo)));
    }

    if (input.cursor) {
      conditions.push(lt(arTransactions.id, input.cursor));
    }

    const rows = await tx
      .select({
        id: arTransactions.id,
        type: arTransactions.type,
        amountCents: arTransactions.amountCents,
        notes: arTransactions.notes,
        status: arTransactions.status,
        sourceModule: arTransactions.sourceModule,
        businessDate: arTransactions.businessDate,
        locationId: arTransactions.locationId,
        departmentId: arTransactions.departmentId,
        createdAt: arTransactions.createdAt,
        accountId: arTransactions.billingAccountId,
        accountName: billingAccounts.name,
        metaJson: arTransactions.metaJson,
      })
      .from(arTransactions)
      .innerJoin(
        billingAccounts,
        and(
          eq(arTransactions.billingAccountId, billingAccounts.id),
          eq(billingAccounts.tenantId, input.tenantId),
        ),
      )
      .where(and(...conditions))
      .orderBy(desc(arTransactions.createdAt), desc(arTransactions.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;

    const transactions: UnifiedLedgerEntry[] = items.map((row) => ({
      id: row.id,
      type: row.type,
      amountCents: Number(row.amountCents),
      notes: row.notes ?? null,
      status: row.status,
      sourceModule: row.sourceModule ?? null,
      businessDate: row.businessDate ?? null,
      locationId: row.locationId ?? null,
      departmentId: row.departmentId ?? null,
      createdAt: row.createdAt.toISOString(),
      accountName: row.accountName,
      accountId: row.accountId,
      metaJson: row.metaJson ?? null,
    }));

    return { transactions, cursor: nextCursor, hasMore };
  });
}
