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
    // ── Accounting ──────────────────────────────────────────────────
    'accounting.journal_posting':     { autoMode: true,  approvalRequired: false, userVisible: false },
    'accounting.period_close':        { autoMode: true,  approvalRequired: false, userVisible: false },
    'accounting.bank_reconciliation': { autoMode: true,  approvalRequired: false, userVisible: false },
    'accounting.depreciation':        { autoMode: true,  approvalRequired: false, userVisible: false },
    'accounting.revenue_recognition': { autoMode: true,  approvalRequired: false, userVisible: false },
    'accounting.year_end_close':      { autoMode: true,  approvalRequired: false, userVisible: false },
    'accounting.eod_reconciliation':  { autoMode: true,  approvalRequired: false, userVisible: false },
    'accounting.intercompany':        { autoMode: true,  approvalRequired: false, userVisible: false },
    'accounting.budget_variance':     { autoMode: true,  approvalRequired: false, userVisible: false },
    'accounting.dormant_accounts':    { autoMode: true,  approvalRequired: false, userVisible: false },
    // ── Payments ────────────────────────────────────────────────────
    'payments.settlement_matching':   { autoMode: true,  approvalRequired: false, userVisible: false },
    'payments.tip_payout':            { autoMode: true,  approvalRequired: false, userVisible: false },
    'payments.refund_approval':       { autoMode: true,  approvalRequired: false, userVisible: false },
    'payments.cash_variance_alert':   { autoMode: true,  approvalRequired: false, userVisible: false },
    'payments.deposit_verification':  { autoMode: true,  approvalRequired: false, userVisible: false },
    'payments.chargeback_deadlines':  { autoMode: true,  approvalRequired: false, userVisible: false },
    // ── Inventory ───────────────────────────────────────────────────
    'inventory.costing':              { autoMode: true,  approvalRequired: false, userVisible: false },
    'inventory.reorder_alerts':       { autoMode: true,  approvalRequired: false, userVisible: false },
    // ── Accounts Payable ────────────────────────────────────────────
    'ap.bill_approval':               { autoMode: true,  approvalRequired: false, userVisible: false },
    'ap.payment_approval':            { autoMode: true,  approvalRequired: false, userVisible: false },
    'ap.payment_scheduling':          { autoMode: true,  approvalRequired: false, userVisible: false },
    // ── Accounts Receivable ─────────────────────────────────────────
    'ar.invoice_posting':             { autoMode: true,  approvalRequired: false, userVisible: false },
    'ar.late_fee_assessment':         { autoMode: true,  approvalRequired: false, userVisible: false },
    'ar.credit_hold':                 { autoMode: true,  approvalRequired: false, userVisible: false },
    'ar.dunning':                     { autoMode: true,  approvalRequired: false, userVisible: false },
    'ar.recurring_invoices':          { autoMode: true,  approvalRequired: false, userVisible: false },
  },
  MID_MARKET: {
    // ── Accounting ──────────────────────────────────────────────────
    'accounting.journal_posting':     { autoMode: true,  approvalRequired: false, userVisible: true },
    'accounting.period_close':        { autoMode: false, approvalRequired: false, userVisible: true },
    'accounting.bank_reconciliation': { autoMode: false, approvalRequired: false, userVisible: true },
    'accounting.depreciation':        { autoMode: true,  approvalRequired: false, userVisible: true },
    'accounting.revenue_recognition': { autoMode: true,  approvalRequired: false, userVisible: true },
    'accounting.year_end_close':      { autoMode: false, approvalRequired: false, userVisible: true },
    'accounting.eod_reconciliation':  { autoMode: true,  approvalRequired: false, userVisible: true },
    'accounting.intercompany':        { autoMode: true,  approvalRequired: false, userVisible: false },
    'accounting.budget_variance':     { autoMode: true,  approvalRequired: false, userVisible: false },
    'accounting.dormant_accounts':    { autoMode: true,  approvalRequired: false, userVisible: false },
    // ── Payments ────────────────────────────────────────────────────
    'payments.settlement_matching':   { autoMode: true,  approvalRequired: false, userVisible: true },
    'payments.tip_payout':            { autoMode: true,  approvalRequired: false, userVisible: false },
    'payments.refund_approval':       { autoMode: true,  approvalRequired: false, userVisible: true },
    'payments.cash_variance_alert':   { autoMode: true,  approvalRequired: false, userVisible: true },
    'payments.deposit_verification':  { autoMode: true,  approvalRequired: false, userVisible: true },
    'payments.chargeback_deadlines':  { autoMode: true,  approvalRequired: false, userVisible: false },
    // ── Inventory ───────────────────────────────────────────────────
    'inventory.costing':              { autoMode: true,  approvalRequired: false, userVisible: true },
    'inventory.reorder_alerts':       { autoMode: true,  approvalRequired: false, userVisible: true },
    // ── Accounts Payable ────────────────────────────────────────────
    'ap.bill_approval':               { autoMode: true,  approvalRequired: false, userVisible: true },
    'ap.payment_approval':            { autoMode: false, approvalRequired: false, userVisible: true },
    'ap.payment_scheduling':          { autoMode: true,  approvalRequired: false, userVisible: false },
    // ── Accounts Receivable ─────────────────────────────────────────
    'ar.invoice_posting':             { autoMode: true,  approvalRequired: false, userVisible: true },
    'ar.late_fee_assessment':         { autoMode: true,  approvalRequired: false, userVisible: false },
    'ar.credit_hold':                 { autoMode: true,  approvalRequired: false, userVisible: true },
    'ar.dunning':                     { autoMode: true,  approvalRequired: false, userVisible: false },
    'ar.recurring_invoices':          { autoMode: true,  approvalRequired: false, userVisible: false },
  },
  ENTERPRISE: {
    // ── Accounting ──────────────────────────────────────────────────
    'accounting.journal_posting':     { autoMode: false, approvalRequired: true,  userVisible: true },
    'accounting.period_close':        { autoMode: false, approvalRequired: true,  userVisible: true },
    'accounting.bank_reconciliation': { autoMode: false, approvalRequired: false, userVisible: true },
    'accounting.depreciation':        { autoMode: false, approvalRequired: true,  userVisible: true },
    'accounting.revenue_recognition': { autoMode: false, approvalRequired: true,  userVisible: true },
    'accounting.year_end_close':      { autoMode: false, approvalRequired: true,  userVisible: true },
    'accounting.eod_reconciliation':  { autoMode: false, approvalRequired: false, userVisible: true },
    'accounting.intercompany':        { autoMode: false, approvalRequired: true,  userVisible: true },
    'accounting.budget_variance':     { autoMode: false, approvalRequired: false, userVisible: true },
    'accounting.dormant_accounts':    { autoMode: true,  approvalRequired: false, userVisible: true },
    // ── Payments ────────────────────────────────────────────────────
    'payments.settlement_matching':   { autoMode: false, approvalRequired: false, userVisible: true },
    'payments.tip_payout':            { autoMode: false, approvalRequired: false, userVisible: true },
    'payments.refund_approval':       { autoMode: false, approvalRequired: true,  userVisible: true },
    'payments.cash_variance_alert':   { autoMode: true,  approvalRequired: false, userVisible: true },
    'payments.deposit_verification':  { autoMode: false, approvalRequired: false, userVisible: true },
    'payments.chargeback_deadlines':  { autoMode: true,  approvalRequired: false, userVisible: true },
    // ── Inventory ───────────────────────────────────────────────────
    'inventory.costing':              { autoMode: true,  approvalRequired: false, userVisible: true },
    'inventory.reorder_alerts':       { autoMode: false, approvalRequired: false, userVisible: true },
    // ── Accounts Payable ────────────────────────────────────────────
    'ap.bill_approval':               { autoMode: false, approvalRequired: true,  userVisible: true },
    'ap.payment_approval':            { autoMode: false, approvalRequired: true,  userVisible: true },
    'ap.payment_scheduling':          { autoMode: false, approvalRequired: true,  userVisible: true },
    // ── Accounts Receivable ─────────────────────────────────────────
    'ar.invoice_posting':             { autoMode: false, approvalRequired: false, userVisible: true },
    'ar.late_fee_assessment':         { autoMode: false, approvalRequired: false, userVisible: true },
    'ar.credit_hold':                 { autoMode: true,  approvalRequired: false, userVisible: true },
    'ar.dunning':                     { autoMode: false, approvalRequired: false, userVisible: true },
    'ar.recurring_invoices':          { autoMode: false, approvalRequired: false, userVisible: true },
  },
};
