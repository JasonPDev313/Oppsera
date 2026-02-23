import { getReconciliationReadApi } from '@oppsera/core/helpers/reconciliation-read-api';

export interface TerminalCloseStatus {
  terminalId: string;
  terminalName: string | null;
  drawerSessionStatus: string | null;
  closeBatchStatus: string | null;
  closeBatchId: string | null;
}

export interface LocationCloseStatus {
  locationId: string;
  businessDate: string;
  retailTerminals: TerminalCloseStatus[];
  fnbBatchStatus: string | null;
  fnbBatchId: string | null;
  depositSlipId: string | null;
  depositSlipStatus: string | null;
  allTerminalsClosed: boolean;
  fnbClosed: boolean;
  depositReady: boolean;
}

export async function getLocationCloseStatus(
  tenantId: string,
  locationId: string,
  businessDate: string,
): Promise<LocationCloseStatus> {
  const api = getReconciliationReadApi();
  return api.getLocationCloseStatus(tenantId, locationId, businessDate);
}
