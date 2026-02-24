export type BusinessTier = 'SMB' | 'MID_MARKET' | 'ENTERPRISE';

export interface TierThresholds {
  annualRevenue: number;
  locationCount: number;
  userCount: number;
  glAccountCount: number;
}

export const TIER_THRESHOLDS: Record<BusinessTier, TierThresholds> = {
  SMB:        { annualRevenue: 0,          locationCount: 0,  userCount: 0,  glAccountCount: 0 },
  MID_MARKET: { annualRevenue: 2_000_000,  locationCount: 5,  userCount: 20, glAccountCount: 100 },
  ENTERPRISE: { annualRevenue: 10_000_000, locationCount: 20, userCount: 50, glAccountCount: 200 },
};

export const WORKFLOW_KEYS = {
  accounting: [
    'journal_posting',
    'period_close',
    'bank_reconciliation',
    'depreciation',
    'revenue_recognition',
  ],
  payments: [
    'settlement_matching',
    'tip_payout',
  ],
  inventory: [
    'costing',
    'reorder_alerts',
  ],
  ap: [
    'bill_approval',
    'payment_approval',
  ],
  ar: [
    'invoice_posting',
    'late_fee_assessment',
  ],
} as const;

export type WorkflowModuleKey = keyof typeof WORKFLOW_KEYS;
export type WorkflowKey<M extends WorkflowModuleKey> = (typeof WORKFLOW_KEYS)[M][number];

/** Flat list of all workflow keys for iteration */
export function getAllWorkflowKeys(): Array<{ moduleKey: WorkflowModuleKey; workflowKey: string }> {
  const result: Array<{ moduleKey: WorkflowModuleKey; workflowKey: string }> = [];
  for (const [moduleKey, keys] of Object.entries(WORKFLOW_KEYS)) {
    for (const wk of keys) {
      result.push({ moduleKey: moduleKey as WorkflowModuleKey, workflowKey: wk });
    }
  }
  return result;
}
