import { getReconciliationReadApi } from '@oppsera/core/helpers/reconciliation-read-api';

export interface TenderAuditTrailStep {
  stage: string;
  label: string;
  status: 'complete' | 'pending' | 'missing';
  timestamp: string | null;
  referenceId: string | null;
  detail?: string;
}

export interface TenderAuditTrail {
  tenderId: string;
  tenderType: string;
  amountCents: number;
  tipAmountCents: number;
  orderId: string;
  orderNumber: string | null;
  businessDate: string;
  locationId: string;
  employeeId: string | null;
  steps: TenderAuditTrailStep[];
}

/**
 * Full lifecycle of a tender: tender → GL → settlement → deposit.
 * Returns a vertical timeline of steps.
 */
export async function getTenderAuditTrail(input: {
  tenantId: string;
  tenderId: string;
}): Promise<TenderAuditTrail | null> {
  const api = getReconciliationReadApi();
  return api.getTenderAuditTrail(input.tenantId, input.tenderId);
}
