/**
 * Canonical F&B batch GL category keys.
 *
 * Each key represents a distinct GL posting category used by buildBatchJournalLines()
 * and resolved to actual GL account IDs by the fnb-posting-adapter.
 *
 * Version 2 adds: tips_payable_cash, processing_fee, auto_gratuity
 * (split tips_payable into credit vs cash, added fee and gratuity categories)
 */
export const FNB_BATCH_CATEGORY_KEYS = [
  'sales_revenue',
  'tax_payable',
  'tips_payable_credit',
  'tips_payable_cash',
  'service_charge_revenue',
  'discount',
  'comp_expense',
  'cash_on_hand',
  'undeposited_funds',
  'cash_over_short',
  'processing_fee',
  'auto_gratuity',
] as const;

export type FnbBatchCategoryKey = (typeof FNB_BATCH_CATEGORY_KEYS)[number];

/** Current version of the category key set. Tracked on batch summaries. */
export const FNB_BATCH_CATEGORY_VERSION = 2;

/** Human-readable labels and GL resolution hints for each category. */
export const FNB_CATEGORY_CONFIG: Record<
  FnbBatchCategoryKey,
  {
    label: string;
    description: string;
    side: 'debit' | 'credit' | 'both';
    /** Which column on fnb_gl_account_mappings to check first */
    mappingColumn: 'revenueAccountId' | 'expenseAccountId' | 'liabilityAccountId' | 'assetAccountId' | 'contraRevenueAccountId';
    /** Entity type in fnb_gl_account_mappings */
    entityType: string;
    /** Whether this category is critical (blocks posting if unmapped) */
    critical: boolean;
  }
> = {
  sales_revenue: {
    label: 'Sales Revenue',
    description: 'Net sales revenue from food & beverage',
    side: 'credit',
    mappingColumn: 'revenueAccountId',
    entityType: 'department',
    critical: true,
  },
  tax_payable: {
    label: 'Tax Payable',
    description: 'Sales tax collected',
    side: 'credit',
    mappingColumn: 'liabilityAccountId',
    entityType: 'tax',
    critical: true,
  },
  tips_payable_credit: {
    label: 'Tips Payable (Credit)',
    description: 'Credit card tips owed to staff',
    side: 'credit',
    mappingColumn: 'liabilityAccountId',
    entityType: 'tips_credit',
    critical: false,
  },
  tips_payable_cash: {
    label: 'Tips Payable (Cash)',
    description: 'Cash tips declared by staff',
    side: 'credit',
    mappingColumn: 'liabilityAccountId',
    entityType: 'tips_cash',
    critical: false,
  },
  service_charge_revenue: {
    label: 'Service Charge Revenue',
    description: 'Auto-gratuity or mandatory service charges',
    side: 'credit',
    mappingColumn: 'revenueAccountId',
    entityType: 'service_charge',
    critical: false,
  },
  discount: {
    label: 'Discounts',
    description: 'Customer-facing price reductions (contra-revenue)',
    side: 'debit',
    mappingColumn: 'contraRevenueAccountId',
    entityType: 'discount',
    critical: false,
  },
  comp_expense: {
    label: 'Comp Expense',
    description: 'Complimentary items (expense, not contra-revenue)',
    side: 'debit',
    mappingColumn: 'expenseAccountId',
    entityType: 'comp',
    critical: false,
  },
  cash_on_hand: {
    label: 'Cash On Hand',
    description: 'Cash received from sales and tips',
    side: 'debit',
    mappingColumn: 'assetAccountId',
    entityType: 'payment_type',
    critical: true,
  },
  undeposited_funds: {
    label: 'Undeposited Funds',
    description: 'Credit card and non-cash payment clearing',
    side: 'debit',
    mappingColumn: 'assetAccountId',
    entityType: 'payment_type',
    critical: true,
  },
  cash_over_short: {
    label: 'Cash Over/Short',
    description: 'Cash register variance (overage or shortage)',
    side: 'both',
    mappingColumn: 'expenseAccountId',
    entityType: 'cash_over_short',
    critical: false,
  },
  processing_fee: {
    label: 'Processing Fees',
    description: 'Credit card processing fees deducted from settlement',
    side: 'debit',
    mappingColumn: 'expenseAccountId',
    entityType: 'processing_fee',
    critical: false,
  },
  auto_gratuity: {
    label: 'Auto-Gratuity',
    description: 'Mandatory gratuity for large parties',
    side: 'credit',
    mappingColumn: 'liabilityAccountId',
    entityType: 'auto_gratuity',
    critical: false,
  },
};
