import { getReconciliationReadApi } from '@oppsera/core/helpers/reconciliation-read-api';

export interface SettlementListItem {
  id: string;
  locationId: string | null;
  settlementDate: string;
  processorName: string;
  processorBatchId: string | null;
  grossAmount: number;
  feeAmount: number;
  netAmount: number;
  chargebackAmount: number;
  status: string;
  bankAccountId: string | null;
  bankAccountName: string | null;
  glJournalEntryId: string | null;
  importSource: string;
  businessDateFrom: string | null;
  businessDateTo: string | null;
  notes: string | null;
  totalLines: number;
  matchedLines: number;
  unmatchedLines: number;
  createdAt: string;
}

interface ListSettlementsInput {
  tenantId: string;
  status?: string;
  processorName?: string;
  startDate?: string;
  endDate?: string;
  cursor?: string;
  limit?: number;
}

export async function listSettlements(
  input: ListSettlementsInput,
): Promise<{ items: SettlementListItem[]; cursor: string | null; hasMore: boolean }> {
  const api = getReconciliationReadApi();
  return api.listSettlements(input.tenantId, {
    status: input.status,
    processorName: input.processorName,
    startDate: input.startDate,
    endDate: input.endDate,
    cursor: input.cursor,
    limit: input.limit,
  });
}
