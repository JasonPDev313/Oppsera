import { getReconciliationReadApi } from '@oppsera/core/helpers/reconciliation-read-api';

export interface TipPayoutItem {
  id: string;
  locationId: string;
  employeeId: string;
  employeeName: string | null;
  payoutType: string;
  amountCents: number;
  businessDate: string;
  drawerSessionId: string | null;
  payrollPeriod: string | null;
  status: string;
  approvedBy: string | null;
  glJournalEntryId: string | null;
  notes: string | null;
  createdAt: string;
}

export interface ListTipPayoutsResult {
  items: TipPayoutItem[];
  cursor: string | null;
  hasMore: boolean;
}

/**
 * List tip payouts with filters and cursor pagination.
 */
export async function listTipPayouts(input: {
  tenantId: string;
  locationId?: string;
  employeeId?: string;
  businessDateFrom?: string;
  businessDateTo?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}): Promise<ListTipPayoutsResult> {
  const api = getReconciliationReadApi();
  return api.listTipPayouts(input.tenantId, {
    locationId: input.locationId,
    employeeId: input.employeeId,
    businessDateFrom: input.businessDateFrom,
    businessDateTo: input.businessDateTo,
    status: input.status,
    cursor: input.cursor,
    limit: input.limit,
  });
}
