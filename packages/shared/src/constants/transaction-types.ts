// ── System Transaction Types Registry ─────────────────────────
// Canonical list of all financial event types recognized by OppsEra.
// System types are seeded globally (tenant_id = NULL).
// Tenants can add custom types that coexist alongside system types.

export type TransactionTypeCategory =
  | 'tender'
  | 'revenue'
  | 'tax'
  | 'tip'
  | 'deposit'
  | 'refund'
  | 'settlement'
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

export interface SystemTransactionType {
  readonly code: string;
  readonly name: string;
  readonly category: TransactionTypeCategory;
  readonly description: string;
  readonly debitHint: string | null;
  readonly creditHint: string | null;
  readonly sort: number;
}

export const SYSTEM_TRANSACTION_TYPES: readonly SystemTransactionType[] = [
  // ── Tender types ──────────────────────────────────────────────
  { code: 'cash', name: 'Cash Payments', category: 'tender', description: 'Physical cash tendered at POS', debitHint: 'asset', creditHint: null, sort: 10 },
  { code: 'card', name: 'Credit/Debit Card', category: 'tender', description: 'Integrated card payments (VPOS)', debitHint: 'asset', creditHint: null, sort: 20 },
  { code: 'ecom', name: 'E-Commerce', category: 'tender', description: 'Online/e-commerce card payments', debitHint: 'asset', creditHint: null, sort: 25 },
  { code: 'check', name: 'Check Payments', category: 'tender', description: 'Paper check payments', debitHint: 'asset', creditHint: null, sort: 30 },
  { code: 'ach', name: 'ACH/EFT', category: 'tender', description: 'Electronic funds transfer payments', debitHint: 'asset', creditHint: null, sort: 40 },
  { code: 'voucher', name: 'Gift Card / Voucher', category: 'tender', description: 'Gift card, voucher, or stored value redemption', debitHint: 'liability', creditHint: null, sort: 50 },
  { code: 'house_account', name: 'House Account / AR', category: 'tender', description: 'Charge to member or house account', debitHint: 'asset', creditHint: null, sort: 60 },
  { code: 'membership_payment', name: 'Payment by Membership ID', category: 'tender', description: 'Payment charged against membership billing', debitHint: 'asset', creditHint: null, sort: 70 },

  // ── Revenue event types ───────────────────────────────────────
  { code: 'gift_card_sold', name: 'Gift Card / Voucher Sold', category: 'revenue', description: 'Sale of a new gift card or voucher', debitHint: 'asset', creditHint: 'liability', sort: 110 },
  { code: 'gift_card_redeemed', name: 'Gift Card / Voucher Redeemed', category: 'revenue', description: 'Redemption of a gift card for goods/services', debitHint: 'liability', creditHint: 'revenue', sort: 120 },
  { code: 'gift_card_expired', name: 'Gift Card Breakage', category: 'revenue', description: 'Expired/unclaimed gift card breakage income', debitHint: 'liability', creditHint: 'revenue', sort: 130 },
  { code: 'tee_booking', name: 'Tee Bookings', category: 'revenue', description: 'Revenue from tee time bookings', debitHint: 'asset', creditHint: 'revenue', sort: 140 },
  { code: 'convenience_fee', name: 'Convenience Fee', category: 'revenue', description: 'Surcharge or convenience fee collected', debitHint: 'asset', creditHint: 'revenue', sort: 150 },

  // ── Tax ────────────────────────────────────────────────────────
  { code: 'sales_tax', name: 'Sales Tax Collected', category: 'tax', description: 'Sales tax collected on transactions', debitHint: null, creditHint: 'liability', sort: 200 },

  // ── Tips ───────────────────────────────────────────────────────
  { code: 'tip_collected', name: 'Tips Collected', category: 'tip', description: 'Tips/gratuities collected from customers', debitHint: null, creditHint: 'liability', sort: 300 },
  { code: 'tip_paidout', name: 'Tips Paid Out', category: 'tip', description: 'Tips paid out to employees', debitHint: 'liability', creditHint: 'asset', sort: 310 },
  { code: 'event_gratuity', name: 'Event Gratuity', category: 'tip', description: 'Auto-gratuity or service charge on events', debitHint: null, creditHint: 'liability', sort: 320 },

  // ── Deposits ───────────────────────────────────────────────────
  { code: 'deposit_taken', name: 'Deposit Taken', category: 'deposit', description: 'Customer deposit for event, lodging, or tee time', debitHint: 'asset', creditHint: 'liability', sort: 400 },
  { code: 'deposit_applied', name: 'Deposit Applied', category: 'deposit', description: 'Previously-taken deposit applied to final payment', debitHint: 'liability', creditHint: 'revenue', sort: 410 },
  { code: 'event_deposit', name: 'Event Deposit', category: 'deposit', description: 'Deposit for event or banquet booking', debitHint: 'asset', creditHint: 'liability', sort: 420 },
  { code: 'event_final_payment', name: 'Event Final Payment', category: 'deposit', description: 'Final balance payment for event deposits', debitHint: 'liability', creditHint: 'revenue', sort: 430 },

  // ── Refunds ────────────────────────────────────────────────────
  { code: 'refund', name: 'Refund / Return', category: 'refund', description: 'Customer refund or merchandise return', debitHint: 'revenue', creditHint: 'asset', sort: 500 },
  { code: 'refund_voucher', name: 'Refund to Voucher', category: 'refund', description: 'Refund issued as store credit or voucher', debitHint: 'revenue', creditHint: 'liability', sort: 510 },
  { code: 'void', name: 'Void / Cancel', category: 'refund', description: 'Voided or canceled transaction', debitHint: null, creditHint: null, sort: 520 },

  // ── Settlement ─────────────────────────────────────────────────
  { code: 'processor_settlement', name: 'Processor Batch Settlement', category: 'settlement', description: 'Batch settlement from card processor', debitHint: 'asset', creditHint: 'asset', sort: 600 },
  { code: 'chargeback', name: 'Chargeback / Dispute', category: 'settlement', description: 'Card chargeback or payment dispute', debitHint: 'expense', creditHint: 'asset', sort: 610 },
  { code: 'processing_fee', name: 'Card Processing Fee', category: 'settlement', description: 'Merchant card processing fee', debitHint: 'expense', creditHint: 'asset', sort: 620 },

  // ── Discount / Comp ────────────────────────────────────────────
  { code: 'discount', name: 'Discount Applied', category: 'other', description: 'Discount applied to transaction (contra-revenue)', debitHint: 'revenue', creditHint: null, sort: 700 },
  { code: 'comp', name: 'Comp / Giveaway', category: 'other', description: 'Complimentary items or services', debitHint: 'expense', creditHint: null, sort: 710 },

  // ── Over/Short ─────────────────────────────────────────────────
  { code: 'over_short', name: 'Over/Short', category: 'other', description: 'Cash drawer over/short variance', debitHint: 'expense', creditHint: 'asset', sort: 800 },
  { code: 'cash_payout', name: 'Cash Payouts', category: 'other', description: 'Cash paid out from drawer (non-refund)', debitHint: 'asset', creditHint: 'asset', sort: 810 },

  // ── AR ─────────────────────────────────────────────────────────
  { code: 'ar_invoice', name: 'AR Invoice Issued', category: 'ar', description: 'Accounts receivable invoice created', debitHint: 'asset', creditHint: 'revenue', sort: 900 },
  { code: 'ar_payment', name: 'AR Payment Received', category: 'ar', description: 'Payment received against AR invoice', debitHint: 'asset', creditHint: 'asset', sort: 910 },

  // ── AP ─────────────────────────────────────────────────────────
  { code: 'ap_bill', name: 'AP Bill Entered', category: 'ap', description: 'Accounts payable bill recorded', debitHint: 'expense', creditHint: 'liability', sort: 1000 },
  { code: 'ap_payment', name: 'AP Payment', category: 'ap', description: 'Payment issued to vendor', debitHint: 'liability', creditHint: 'asset', sort: 1010 },

  // ── Inventory ──────────────────────────────────────────────────
  { code: 'inventory_receiving', name: 'Inventory Receiving', category: 'inventory', description: 'Inventory received from vendor', debitHint: 'asset', creditHint: 'liability', sort: 1050 },
  { code: 'cogs_recognition', name: 'COGS Recognition', category: 'inventory', description: 'Cost of goods sold posting', debitHint: 'expense', creditHint: 'asset', sort: 1060 },

  // ── Membership ─────────────────────────────────────────────────
  { code: 'membership_sale', name: 'Membership Sale / Dues', category: 'membership', description: 'New membership or renewal dues', debitHint: 'asset', creditHint: 'revenue', sort: 1100 },
  { code: 'membership_ar_payment', name: 'Membership AR Payment', category: 'membership', description: 'Payment received on member account', debitHint: 'asset', creditHint: 'asset', sort: 1110 },
  { code: 'membership_ap', name: 'Membership Amount AP', category: 'membership', description: 'Membership-related accounts payable', debitHint: 'asset', creditHint: 'liability', sort: 1120 },

  // ── Event types ────────────────────────────────────────────────
  { code: 'event_registration', name: 'Event Registration', category: 'revenue', description: 'Revenue from event or tournament registration', debitHint: 'asset', creditHint: 'revenue', sort: 1200 },
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
  'membership',
  'ar',
  'ap',
  'inventory',
  'other',
];
