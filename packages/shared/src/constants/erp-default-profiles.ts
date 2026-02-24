import type { BusinessTier } from './erp-tiers';

export interface WorkflowDefault {
  autoMode: boolean;
  approvalRequired: boolean;
  userVisible: boolean;
}

/**
 * Default workflow configs per business tier.
 *
 * SMB:        everything automatic and invisible
 * MID_MARKET: visible but mostly automatic
 * ENTERPRISE: manual, approvals, fully visible
 */
export const TIER_WORKFLOW_DEFAULTS: Record<BusinessTier, Record<string, WorkflowDefault>> = {
  SMB: {
    'accounting.journal_posting':     { autoMode: true,  approvalRequired: false, userVisible: false },
    'accounting.period_close':        { autoMode: true,  approvalRequired: false, userVisible: false },
    'accounting.bank_reconciliation': { autoMode: true,  approvalRequired: false, userVisible: false },
    'accounting.depreciation':        { autoMode: true,  approvalRequired: false, userVisible: false },
    'accounting.revenue_recognition': { autoMode: true,  approvalRequired: false, userVisible: false },
    'payments.settlement_matching':   { autoMode: true,  approvalRequired: false, userVisible: false },
    'payments.tip_payout':            { autoMode: true,  approvalRequired: false, userVisible: false },
    'inventory.costing':              { autoMode: true,  approvalRequired: false, userVisible: false },
    'inventory.reorder_alerts':       { autoMode: true,  approvalRequired: false, userVisible: false },
    'ap.bill_approval':               { autoMode: true,  approvalRequired: false, userVisible: false },
    'ap.payment_approval':            { autoMode: true,  approvalRequired: false, userVisible: false },
    'ar.invoice_posting':             { autoMode: true,  approvalRequired: false, userVisible: false },
    'ar.late_fee_assessment':         { autoMode: true,  approvalRequired: false, userVisible: false },
  },
  MID_MARKET: {
    'accounting.journal_posting':     { autoMode: true,  approvalRequired: false, userVisible: true },
    'accounting.period_close':        { autoMode: false, approvalRequired: false, userVisible: true },
    'accounting.bank_reconciliation': { autoMode: false, approvalRequired: false, userVisible: true },
    'accounting.depreciation':        { autoMode: true,  approvalRequired: false, userVisible: true },
    'accounting.revenue_recognition': { autoMode: true,  approvalRequired: false, userVisible: true },
    'payments.settlement_matching':   { autoMode: true,  approvalRequired: false, userVisible: true },
    'payments.tip_payout':            { autoMode: true,  approvalRequired: false, userVisible: false },
    'inventory.costing':              { autoMode: true,  approvalRequired: false, userVisible: true },
    'inventory.reorder_alerts':       { autoMode: true,  approvalRequired: false, userVisible: true },
    'ap.bill_approval':               { autoMode: true,  approvalRequired: false, userVisible: true },
    'ap.payment_approval':            { autoMode: false, approvalRequired: false, userVisible: true },
    'ar.invoice_posting':             { autoMode: true,  approvalRequired: false, userVisible: true },
    'ar.late_fee_assessment':         { autoMode: true,  approvalRequired: false, userVisible: false },
  },
  ENTERPRISE: {
    'accounting.journal_posting':     { autoMode: false, approvalRequired: true,  userVisible: true },
    'accounting.period_close':        { autoMode: false, approvalRequired: true,  userVisible: true },
    'accounting.bank_reconciliation': { autoMode: false, approvalRequired: false, userVisible: true },
    'accounting.depreciation':        { autoMode: false, approvalRequired: true,  userVisible: true },
    'accounting.revenue_recognition': { autoMode: false, approvalRequired: true,  userVisible: true },
    'payments.settlement_matching':   { autoMode: false, approvalRequired: false, userVisible: true },
    'payments.tip_payout':            { autoMode: false, approvalRequired: false, userVisible: true },
    'inventory.costing':              { autoMode: true,  approvalRequired: false, userVisible: true },
    'inventory.reorder_alerts':       { autoMode: false, approvalRequired: false, userVisible: true },
    'ap.bill_approval':               { autoMode: false, approvalRequired: true,  userVisible: true },
    'ap.payment_approval':            { autoMode: false, approvalRequired: true,  userVisible: true },
    'ar.invoice_posting':             { autoMode: false, approvalRequired: false, userVisible: true },
    'ar.late_fee_assessment':         { autoMode: false, approvalRequired: false, userVisible: true },
  },
};
