import { getReconciliationReadApi } from '@oppsera/core/helpers/reconciliation-read-api';

export interface SettlementDetail {
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
  createdAt: string;
  updatedAt: string;
  lines: SettlementLineDetail[];
}

export interface SettlementLineDetail {
  id: string;
  tenderId: string | null;
  originalAmountCents: number;
  settledAmountCents: number;
  feeCents: number;
  netCents: number;
  status: string;
  matchedAt: string | null;
  // Enriched from tender join
  tenderType: string | null;
  tenderBusinessDate: string | null;
  orderId: string | null;
  cardLast4: string | null;
  cardBrand: string | null;
}

interface GetSettlementInput {
  tenantId: string;
  settlementId: string;
}

export async function getSettlement(
  input: GetSettlementInput,
): Promise<SettlementDetail | null> {
  const api = getReconciliationReadApi();
  return api.getSettlementDetail(input.tenantId, input.settlementId);
}
