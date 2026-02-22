import { getReconciliationReadApi } from '@oppsera/core/helpers/reconciliation-read-api';

export interface TipBalanceItem {
  employeeId: string;
  employeeName: string | null;
  totalTipsCents: number;
  totalPaidCents: number;
  balanceCents: number;
  lastTipDate: string | null;
  lastPayoutDate: string | null;
}

/**
 * Get outstanding tip balances for all employees at a location.
 * Balance = SUM(tenders.tipAmount) - SUM(completed tip payouts).
 */
export async function getTipBalances(input: {
  tenantId: string;
  locationId?: string;
  asOfDate?: string;
}): Promise<TipBalanceItem[]> {
  const api = getReconciliationReadApi();
  const asOf = input.asOfDate ?? new Date().toISOString().slice(0, 10);
  return api.getTipBalances(input.tenantId, asOf, input.locationId);
}
