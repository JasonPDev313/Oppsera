import { eq, and, lt, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { storedValueTransactions } from '@oppsera/db';

export interface GetStoredValueTransactionsInput {
  tenantId: string;
  instrumentId: string;
  cursor?: string;
  limit?: number;
}

export interface StoredValueTransactionEntry {
  id: string;
  txnType: string;
  amountCents: number;
  unitDelta: number | null;
  runningBalanceCents: number;
  sourceModule: string | null;
  sourceId: string | null;
  reason: string | null;
  createdAt: string;
  createdBy: string;
}

export async function getStoredValueTransactions(
  input: GetStoredValueTransactionsInput,
): Promise<{ transactions: StoredValueTransactionEntry[]; cursor: string | null; hasMore: boolean }> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      eq(storedValueTransactions.tenantId, input.tenantId),
      eq(storedValueTransactions.instrumentId, input.instrumentId),
    ];

    if (input.cursor) {
      conditions.push(lt(storedValueTransactions.id, input.cursor));
    }

    const rows = await tx
      .select({
        id: storedValueTransactions.id,
        txnType: storedValueTransactions.txnType,
        amountCents: storedValueTransactions.amountCents,
        unitDelta: storedValueTransactions.unitDelta,
        runningBalanceCents: storedValueTransactions.runningBalanceCents,
        sourceModule: storedValueTransactions.sourceModule,
        sourceId: storedValueTransactions.sourceId,
        reason: storedValueTransactions.reason,
        createdAt: storedValueTransactions.createdAt,
        createdBy: storedValueTransactions.createdBy,
      })
      .from(storedValueTransactions)
      .where(and(...conditions))
      .orderBy(desc(storedValueTransactions.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;

    const transactions: StoredValueTransactionEntry[] = items.map((row) => ({
      id: row.id,
      txnType: row.txnType,
      amountCents: row.amountCents,
      unitDelta: row.unitDelta ?? null,
      runningBalanceCents: row.runningBalanceCents,
      sourceModule: row.sourceModule ?? null,
      sourceId: row.sourceId ?? null,
      reason: row.reason ?? null,
      createdAt: row.createdAt.toISOString(),
      createdBy: row.createdBy,
    }));

    return { transactions, cursor: nextCursor, hasMore };
  });
}
