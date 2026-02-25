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
    'year_end_close',
    'eod_reconciliation',
    'intercompany',
    'budget_variance',
    'dormant_accounts',
  ],
  payments: [
    'settlement_matching',
    'tip_payout',
    'refund_approval',
    'cash_variance_alert',
    'deposit_verification',
    'chargeback_deadlines',
  ],
  inventory: [
    'costing',
    'reorder_alerts',
  ],
  ap: [
    'bill_approval',
    'payment_approval',
    'payment_scheduling',
  ],
  ar: [
    'invoice_posting',
    'late_fee_assessment',
    'credit_hold',
    'dunning',
    'recurring_invoices',
  ],
} as const;

/**
 * Workflows marked as "coming soon" — UI shows badge and disables toggles.
 * These have no backing infrastructure yet.
 */
export const COMING_SOON_WORKFLOWS = new Set([
  'accounting.intercompany',
  'accounting.budget_variance',
  'accounting.dormant_accounts',
  'payments.chargeback_deadlines',
  'ap.payment_scheduling',
  'ar.dunning',
  'ar.recurring_invoices',
]);

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
