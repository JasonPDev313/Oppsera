// ── System Transaction Types Registry ─────────────────────────
// Canonical list of all financial event types recognized by OppsEra.
// System types are seeded globally (tenant_id = NULL).
// Tenants can add custom types that coexist alongside system types.
// The 45 types include tender/payment types as a category alongside
// revenue, tax, tip, and structural types.

export type TransactionTypeCategory =
  | 'tender'
  | 'revenue'
  | 'tax'
  | 'tip'
  | 'deposit'
  | 'refund'
  | 'settlement'
  | 'discount'
  | 'comp'
  | 'ar'
  | 'ap'
  | 'inventory'
  | 'membership'
  | 'other';

export type TenderPostingMode = 'clearing' | 'direct_bank' | 'non_cash';

export type TenderCategory =
  | 'external_card'
  | 'external_cash'
  | 'external_ach'
  | 'external_wallet'
  | 'house_account'
  | 'barter'
  | 'comp'
  | 'other';

export type ReportingBucket = 'include' | 'exclude_revenue' | 'comp';

/**
 * Debit-side classification for backfill, AccountPicker filtering, and auto-map.
 * Drives which `payment_type_gl_defaults` column gets backfilled for tender types.
 */
export type DebitKind =
  | 'cash_bank'           // Dr Cash on Hand or Bank account (asset)
  | 'clearing'            // Dr Clearing / Undeposited Funds (asset/liability)
  | 'ar_receivable'       // Dr Accounts Receivable (asset) — own posting path
  | 'liability_reduction' // Dr Gift Card / Deposit Liability (liability) — own posting path
  | 'expense'             // Dr Expense account
  | 'contra_revenue'      // Dr Contra-revenue (e.g., discounts, returns)
  | 'none';               // No debit mapping applicable

/**
 * Credit-side classification for backfill, AccountPicker filtering, and auto-map.
 * For revenue/tax/tip types this is informational — actual posting uses
 * sub_department_gl_defaults, tax_group_gl_defaults, or accounting_settings.
 */
export type CreditKind =
  | 'revenue'             // Cr Revenue account
  | 'tax_payable'         // Cr Tax Payable (liability)
  | 'tips_payable'        // Cr Tips Payable (liability)
  | 'deposit_liability'   // Cr Deposit / Deferred Revenue (liability)
  | 'clearing'            // Cr Clearing account (asset/liability)
  | 'cash_bank'           // Cr Cash / Bank account (asset)
  | 'expense'             // Cr Expense account (rare — tip payouts)
  | 'none';               // No credit mapping applicable

/** Which side(s) must be set for a transaction type to be considered "mapped" */
export type MappedStatusRule = 'debit' | 'credit' | 'both' | 'either';

export interface SystemTransactionType {
  readonly code: string;
  readonly name: string;
  readonly category: TransactionTypeCategory;
  readonly description: string;
  readonly debitHint: string | null;
  readonly creditHint: string | null;
  readonly defaultDebitKind: DebitKind;
  readonly defaultCreditKind: CreditKind;
  readonly sort: number;
}

export const SYSTEM_TRANSACTION_TYPES: readonly SystemTransactionType[] = [
  // ── Tender types ──────────────────────────────────────────────
  { code: 'cash', name: 'Cash Payments', category: 'tender', description: 'Physical cash tendered at POS', debitHint: 'asset', creditHint: null, defaultDebitKind: 'cash_bank', defaultCreditKind: 'none', sort: 10 },
  { code: 'card', name: 'Credit/Debit Card', category: 'tender', description: 'Integrated card payments (VPOS)', debitHint: 'asset', creditHint: null, defaultDebitKind: 'clearing', defaultCreditKind: 'none', sort: 20 },
  { code: 'ecom', name: 'E-Commerce', category: 'tender', description: 'Online/e-commerce card payments', debitHint: 'asset', creditHint: null, defaultDebitKind: 'clearing', defaultCreditKind: 'none', sort: 25 },
  { code: 'check', name: 'Check Payments', category: 'tender', description: 'Paper check payments', debitHint: 'asset', creditHint: null, defaultDebitKind: 'cash_bank', defaultCreditKind: 'none', sort: 30 },
  { code: 'ach', name: 'ACH/EFT', category: 'tender', description: 'Electronic funds transfer payments', debitHint: 'asset', creditHint: null, defaultDebitKind: 'clearing', defaultCreditKind: 'none', sort: 40 },
  { code: 'voucher', name: 'Gift Card / Voucher', category: 'tender', description: 'Gift card, voucher, or stored value redemption', debitHint: 'liability', creditHint: null, defaultDebitKind: 'liability_reduction', defaultCreditKind: 'none', sort: 50 },
  { code: 'house_account', name: 'House Account / AR', category: 'tender', description: 'Charge to member or house account', debitHint: 'asset', creditHint: null, defaultDebitKind: 'ar_receivable', defaultCreditKind: 'none', sort: 60 },
  { code: 'membership_payment', name: 'Payment by Membership ID', category: 'tender', description: 'Payment charged against membership billing', debitHint: 'asset', creditHint: null, defaultDebitKind: 'ar_receivable', defaultCreditKind: 'none', sort: 70 },

  // ── Revenue event types ───────────────────────────────────────
  { code: 'gift_card_sold', name: 'Gift Card / Voucher Sold', category: 'revenue', description: 'Sale of a new gift card or voucher', debitHint: 'asset', creditHint: 'liability', defaultDebitKind: 'cash_bank', defaultCreditKind: 'deposit_liability', sort: 110 },
  { code: 'gift_card_redeemed', name: 'Gift Card / Voucher Redeemed', category: 'revenue', description: 'Redemption of a gift card for goods/services', debitHint: 'liability', creditHint: 'revenue', defaultDebitKind: 'liability_reduction', defaultCreditKind: 'revenue', sort: 120 },
  { code: 'gift_card_expired', name: 'Gift Card Breakage', category: 'revenue', description: 'Expired/unclaimed gift card breakage income', debitHint: 'liability', creditHint: 'revenue', defaultDebitKind: 'liability_reduction', defaultCreditKind: 'revenue', sort: 130 },
  { code: 'tee_time', name: 'Tee Times', category: 'revenue', description: 'Revenue from tee time bookings', debitHint: 'asset', creditHint: 'revenue', defaultDebitKind: 'none', defaultCreditKind: 'revenue', sort: 140 },
  { code: 'convenience_fee', name: 'Convenience Fee', category: 'revenue', description: 'Surcharge or convenience fee collected', debitHint: 'asset', creditHint: 'revenue', defaultDebitKind: 'none', defaultCreditKind: 'revenue', sort: 150 },

  // ── Tax ────────────────────────────────────────────────────────
  { code: 'sales_tax', name: 'Sales Tax Collected', category: 'tax', description: 'Sales tax collected on transactions', debitHint: null, creditHint: 'liability', defaultDebitKind: 'none', defaultCreditKind: 'tax_payable', sort: 200 },

  // ── Tips ───────────────────────────────────────────────────────
  { code: 'tip_collected', name: 'Tips Collected', category: 'tip', description: 'Tips/gratuities collected from customers', debitHint: null, creditHint: 'liability', defaultDebitKind: 'none', defaultCreditKind: 'tips_payable', sort: 300 },
  { code: 'tip_paidout', name: 'Tips Paid Out', category: 'tip', description: 'Tips paid out to employees', debitHint: 'liability', creditHint: 'asset', defaultDebitKind: 'liability_reduction', defaultCreditKind: 'cash_bank', sort: 310 },
  { code: 'event_gratuity', name: 'Event Gratuity', category: 'tip', description: 'Auto-gratuity or service charge on events', debitHint: null, creditHint: 'liability', defaultDebitKind: 'none', defaultCreditKind: 'tips_payable', sort: 320 },

  // ── Deposits ───────────────────────────────────────────────────
  { code: 'deposit_taken', name: 'Deposit Taken', category: 'deposit', description: 'Customer deposit for event, lodging, or tee time', debitHint: 'asset', creditHint: 'liability', defaultDebitKind: 'cash_bank', defaultCreditKind: 'deposit_liability', sort: 400 },
  { code: 'deposit_applied', name: 'Deposit Applied', category: 'deposit', description: 'Previously-taken deposit applied to final payment', debitHint: 'liability', creditHint: 'revenue', defaultDebitKind: 'liability_reduction', defaultCreditKind: 'revenue', sort: 410 },
  { code: 'event_deposit', name: 'Event Deposit', category: 'deposit', description: 'Deposit for event or banquet booking', debitHint: 'asset', creditHint: 'liability', defaultDebitKind: 'cash_bank', defaultCreditKind: 'deposit_liability', sort: 420 },
  { code: 'event_final_payment', name: 'Event Final Payment', category: 'deposit', description: 'Final balance payment for event deposits', debitHint: 'liability', creditHint: 'revenue', defaultDebitKind: 'liability_reduction', defaultCreditKind: 'revenue', sort: 430 },

  // ── Refunds ────────────────────────────────────────────────────
  { code: 'refund', name: 'Refund / Return', category: 'refund', description: 'Customer refund or merchandise return', debitHint: 'revenue', creditHint: 'asset', defaultDebitKind: 'contra_revenue', defaultCreditKind: 'cash_bank', sort: 500 },
  { code: 'refund_voucher', name: 'Refund to Voucher', category: 'refund', description: 'Refund issued as store credit or voucher', debitHint: 'revenue', creditHint: 'liability', defaultDebitKind: 'contra_revenue', defaultCreditKind: 'deposit_liability', sort: 510 },
  { code: 'void', name: 'Void / Cancel', category: 'refund', description: 'Voided or canceled transaction — GL reversal is automatic via void adapter', debitHint: null, creditHint: null, defaultDebitKind: 'none', defaultCreditKind: 'none', sort: 520 },

  // ── Settlement ─────────────────────────────────────────────────
  { code: 'processor_settlement', name: 'Processor Batch Settlement', category: 'settlement', description: 'Batch settlement from card processor', debitHint: 'asset', creditHint: 'asset', defaultDebitKind: 'cash_bank', defaultCreditKind: 'clearing', sort: 600 },
  { code: 'chargeback', name: 'Chargeback / Dispute', category: 'settlement', description: 'Card chargeback or payment dispute', debitHint: 'expense', creditHint: 'asset', defaultDebitKind: 'expense', defaultCreditKind: 'cash_bank', sort: 610 },
  { code: 'processing_fee', name: 'Card Processing Fee', category: 'settlement', description: 'Merchant card processing fee', debitHint: 'expense', creditHint: 'asset', defaultDebitKind: 'expense', defaultCreditKind: 'clearing', sort: 620 },

  // ── Discounts (contra-revenue — reduce reported revenue) ───────
  { code: 'manual_discount',   name: 'Sales Discounts - Manual',    category: 'discount', description: 'Cashier-applied percentage or dollar off',                debitHint: 'revenue', creditHint: null, defaultDebitKind: 'contra_revenue', defaultCreditKind: 'none', sort: 700 },
  { code: 'promo_code',        name: 'Promotional Discounts',       category: 'discount', description: 'Promo code or coupon redemptions',                        debitHint: 'revenue', creditHint: null, defaultDebitKind: 'contra_revenue', defaultCreditKind: 'none', sort: 701 },
  { code: 'employee_discount', name: 'Employee Discounts',          category: 'discount', description: 'Staff meal or merchandise discounts',                     debitHint: 'revenue', creditHint: null, defaultDebitKind: 'contra_revenue', defaultCreditKind: 'none', sort: 702 },
  { code: 'loyalty_discount',  name: 'Loyalty Program Discounts',   category: 'discount', description: 'Points redemption or member pricing',                     debitHint: 'revenue', creditHint: null, defaultDebitKind: 'contra_revenue', defaultCreditKind: 'none', sort: 703 },
  { code: 'member_discount',   name: 'Member Discounts',            category: 'discount', description: 'Membership-based pricing (golf/club member rates)',       debitHint: 'revenue', creditHint: null, defaultDebitKind: 'contra_revenue', defaultCreditKind: 'none', sort: 704 },
  { code: 'price_match',       name: 'Price Match Adjustments',     category: 'discount', description: 'Competitor price matching',                               debitHint: 'revenue', creditHint: null, defaultDebitKind: 'contra_revenue', defaultCreditKind: 'none', sort: 705 },

  // ── Comps (expense — cost the business absorbs) ───────────────
  { code: 'manager_comp',      name: 'Manager Comps',               category: 'comp',     description: 'Manager-authorized giveaways',                            debitHint: 'expense', creditHint: null, defaultDebitKind: 'expense', defaultCreditKind: 'none', sort: 710 },
  { code: 'promo_comp',        name: 'Promotional Comps',           category: 'comp',     description: 'Marketing or promotion giveaways',                        debitHint: 'expense', creditHint: null, defaultDebitKind: 'expense', defaultCreditKind: 'none', sort: 711 },
  { code: 'quality_recovery',  name: 'Quality Recovery Expense',    category: 'comp',     description: 'Food or service quality issue comps',                     debitHint: 'expense', creditHint: null, defaultDebitKind: 'expense', defaultCreditKind: 'none', sort: 712 },
  { code: 'price_override',    name: 'Price Override Loss',         category: 'comp',     description: 'Revenue loss from manual price reductions',               debitHint: 'expense', creditHint: null, defaultDebitKind: 'expense', defaultCreditKind: 'none', sort: 713 },
  { code: 'other_comp',        name: 'Other Comps & Write-offs',    category: 'comp',     description: 'Catch-all comp expense',                                  debitHint: 'expense', creditHint: null, defaultDebitKind: 'expense', defaultCreditKind: 'none', sort: 714 },

  // ── Over/Short ─────────────────────────────────────────────────
  { code: 'over_short', name: 'Over/Short', category: 'other', description: 'Cash drawer over/short variance', debitHint: 'expense', creditHint: 'asset', defaultDebitKind: 'expense', defaultCreditKind: 'cash_bank', sort: 800 },
  { code: 'cash_payout', name: 'Cash Payouts', category: 'other', description: 'Cash paid out from drawer (non-refund)', debitHint: 'asset', creditHint: 'asset', defaultDebitKind: 'expense', defaultCreditKind: 'cash_bank', sort: 810 },

  // ── AR ─────────────────────────────────────────────────────────
  { code: 'ar_invoice', name: 'AR Invoice Issued', category: 'ar', description: 'Accounts receivable invoice created', debitHint: 'asset', creditHint: 'revenue', defaultDebitKind: 'ar_receivable', defaultCreditKind: 'revenue', sort: 900 },
  { code: 'ar_payment', name: 'AR Payment Received', category: 'ar', description: 'Payment received against AR invoice', debitHint: 'asset', creditHint: 'asset', defaultDebitKind: 'cash_bank', defaultCreditKind: 'none', sort: 910 },

  // ── AP ─────────────────────────────────────────────────────────
  { code: 'ap_bill', name: 'AP Bill Entered', category: 'ap', description: 'Accounts payable bill recorded', debitHint: 'expense', creditHint: 'liability', defaultDebitKind: 'expense', defaultCreditKind: 'deposit_liability', sort: 1000 },
  { code: 'ap_payment', name: 'AP Payment', category: 'ap', description: 'Payment issued to vendor', debitHint: 'liability', creditHint: 'asset', defaultDebitKind: 'liability_reduction', defaultCreditKind: 'cash_bank', sort: 1010 },

  // ── Inventory ──────────────────────────────────────────────────
  { code: 'inventory_receiving', name: 'Inventory Receiving', category: 'inventory', description: 'Inventory received from vendor', debitHint: 'asset', creditHint: 'liability', defaultDebitKind: 'cash_bank', defaultCreditKind: 'deposit_liability', sort: 1050 },
  { code: 'cogs_recognition', name: 'COGS Recognition', category: 'inventory', description: 'Cost of goods sold posting', debitHint: 'expense', creditHint: 'asset', defaultDebitKind: 'expense', defaultCreditKind: 'cash_bank', sort: 1060 },

  // ── Membership ─────────────────────────────────────────────────
  { code: 'membership_sale', name: 'Membership Sale / Dues', category: 'membership', description: 'New membership or renewal dues', debitHint: 'asset', creditHint: 'revenue', defaultDebitKind: 'ar_receivable', defaultCreditKind: 'revenue', sort: 1100 },
  { code: 'membership_ar_payment', name: 'Membership AR Payment', category: 'membership', description: 'Payment received on member account', debitHint: 'asset', creditHint: 'asset', defaultDebitKind: 'cash_bank', defaultCreditKind: 'none', sort: 1110 },
  { code: 'membership_ap', name: 'Membership Amount AP', category: 'membership', description: 'Membership-related accounts payable', debitHint: 'asset', creditHint: 'liability', defaultDebitKind: 'expense', defaultCreditKind: 'deposit_liability', sort: 1120 },

  // ── Event types ────────────────────────────────────────────────
  { code: 'event_registration', name: 'Event Registration', category: 'revenue', description: 'Revenue from event or tournament registration', debitHint: 'asset', creditHint: 'revenue', defaultDebitKind: 'none', defaultCreditKind: 'revenue', sort: 1200 },
] as const;

/** Category display labels for grouping in UI */
export const TRANSACTION_TYPE_CATEGORY_LABELS: Record<TransactionTypeCategory, string> = {
  tender: 'Payment Types',
  revenue: 'Revenue',
  tax: 'Tax',
  tip: 'Tips & Gratuity',
  deposit: 'Deposits',
  refund: 'Refunds & Voids',
  settlement: 'Settlement & Processing',
  discount: 'Discounts',
  comp: 'Comps & Write-offs',
  ar: 'Accounts Receivable',
  ap: 'Accounts Payable',
  inventory: 'Inventory',
  membership: 'Memberships',
  other: 'Other',
};

/** Category sort order for display */
export const TRANSACTION_TYPE_CATEGORY_ORDER: TransactionTypeCategory[] = [
  'tender',
  'revenue',
  'tax',
  'tip',
  'deposit',
  'refund',
  'settlement',
  'discount',
  'comp',
  'membership',
  'ar',
  'ap',
  'inventory',
  'other',
];

/**
 * Returns which side(s) must be mapped for a category to be considered "mapped".
 * Prevents false "done" states in the UI.
 */
export function getMappedStatusRule(category: TransactionTypeCategory): MappedStatusRule {
  switch (category) {
    case 'tender': return 'debit';
    case 'revenue': return 'credit';
    case 'tax': return 'credit';
    case 'tip': return 'credit';
    case 'deposit': return 'both';
    case 'refund': return 'both';
    case 'settlement': return 'both';
    case 'discount': return 'debit';
    case 'comp': return 'debit';
    case 'ar': return 'both';
    case 'ap': return 'both';
    case 'inventory': return 'both';
    case 'membership': return 'both';
    case 'other': return 'either';
  }
}

/** Maps DebitKind to GL account type filter for AccountPicker */
export const DEBIT_KIND_ACCOUNT_FILTER: Record<DebitKind, readonly string[]> = {
  cash_bank: ['asset'],
  clearing: ['asset', 'liability'],
  ar_receivable: ['asset'],
  liability_reduction: ['liability'],
  expense: ['expense'],
  contra_revenue: ['revenue'],
  none: [],
};

/** Maps CreditKind to GL account type filter for AccountPicker */
export const CREDIT_KIND_ACCOUNT_FILTER: Record<CreditKind, readonly string[]> = {
  revenue: ['revenue'],
  tax_payable: ['liability'],
  tips_payable: ['liability'],
  deposit_liability: ['liability'],
  clearing: ['asset', 'liability'],
  cash_bank: ['asset'],
  expense: ['expense'],
  none: [],
};

/** Valid GL account types for tender debit backfill validation */
export const DEBIT_KIND_VALID_ACCOUNT_TYPES: Record<DebitKind, readonly string[]> = {
  cash_bank: ['asset'],
  clearing: ['asset', 'liability'],
  ar_receivable: ['asset'],
  liability_reduction: ['liability'],
  expense: ['expense'],
  contra_revenue: ['revenue'],
  none: [],
};

/** Look up a system transaction type by code */
export function getSystemTransactionType(code: string): SystemTransactionType | undefined {
  return SYSTEM_TRANSACTION_TYPES.find(t => t.code === code);
}

/**
 * Returns true for transaction types that are automatically posted by GL adapters
 * and do NOT require manual GL account mapping. Example: void/cancel — the void
 * adapter automatically reverses the original GL entry.
 */
export function isAutoPostedType(code: string): boolean {
  const sysType = getSystemTransactionType(code);
  if (!sysType) return false;
  return sysType.defaultDebitKind === 'none' && sysType.defaultCreditKind === 'none';
}
