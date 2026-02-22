import { getReconciliationReadApi } from '@oppsera/core/helpers/reconciliation-read-api';

export interface UnmatchedTender {
  id: string;
  orderId: string;
  tenderType: string;
  amount: number;
  tipAmount: number;
  businessDate: string;
  cardLast4: string | null;
  cardBrand: string | null;
  providerRef: string | null;
  createdAt: string;
}

interface GetUnmatchedTendersInput {
  tenantId: string;
  startDate?: string;
  endDate?: string;
  locationId?: string;
  tenderType?: string;
  limit?: number;
  cursor?: string;
}

export async function getUnmatchedTenders(
  input: GetUnmatchedTendersInput,
): Promise<{ items: UnmatchedTender[]; cursor: string | null; hasMore: boolean }> {
  const limit = input.limit ?? 100;
  const api = getReconciliationReadApi();

  const startDate = input.startDate ?? '1970-01-01';
  const endDate = input.endDate ?? '2999-12-31';

  const allRows = await api.getUnmatchedTenders(input.tenantId, startDate, endDate);

  // Apply additional filters in-memory (the API returns all unmatched for the period)
  let filtered = allRows;
  if (input.tenderType) {
    filtered = filtered.filter((r) => r.tenderType === input.tenderType);
  }
  if (input.cursor) {
    const cursorIdx = filtered.findIndex((r) => r.id === input.cursor);
    if (cursorIdx >= 0) {
      filtered = filtered.slice(cursorIdx + 1);
    }
  }

  const hasMore = filtered.length > limit;
  const items = hasMore ? filtered.slice(0, limit) : filtered;

  return {
    items,
    cursor: hasMore ? items[items.length - 1]!.id : null,
    hasMore,
  };
}
