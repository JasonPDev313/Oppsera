/**
 * Account Role Mapping
 *
 * Maps system account roles to their DEFAULT account numbers.
 * Oppsera modules reference GL accounts by role key, NEVER by account number.
 *
 * This file is the single source of truth for programmatic account resolution.
 * The bootstrap/seed process writes these accounts with the corresponding
 * `account_role` column value so the runtime lookup is:
 *   SELECT id FROM gl_accounts WHERE tenant_id = $1 AND account_role = $2
 *
 * Tenants may re-number accounts freely — modules always resolve by role.
 */

// ── Account Role Keys ───────────────────────────────────────────────
export const ACCOUNT_ROLES = {
  // ── Cash & Banking ──────────────────────────────────────────────
  CASH_OPERATING: 'CASH_OPERATING',
  CASH_PETTY: 'CASH_PETTY',
  CASH_SAFE: 'CASH_SAFE',
  UNDEPOSITED_FUNDS: 'UNDEPOSITED_FUNDS',
  MERCHANT_CLEARING: 'MERCHANT_CLEARING',
  GIFT_CARD_CLEARING: 'GIFT_CARD_CLEARING',

  // ── Receivables ─────────────────────────────────────────────────
  AR_CONTROL: 'AR_CONTROL',
  AR_HOUSE: 'AR_HOUSE',
  AR_CORPORATE: 'AR_CORPORATE',

  // ── Inventory ───────────────────────────────────────────────────
  INVENTORY_CONTROL: 'INVENTORY_CONTROL',
  INVENTORY_RETAIL: 'INVENTORY_RETAIL',
  INVENTORY_FOOD: 'INVENTORY_FOOD',
  INVENTORY_BEVERAGE: 'INVENTORY_BEVERAGE',
  INVENTORY_SUPPLIES: 'INVENTORY_SUPPLIES',
  INVENTORY_RENTAL: 'INVENTORY_RENTAL',

  // ── Payables ────────────────────────────────────────────────────
  AP_CONTROL: 'AP_CONTROL',
  CREDIT_CARDS_PAYABLE: 'CREDIT_CARDS_PAYABLE',
  MERCHANT_FEES_PAYABLE: 'MERCHANT_FEES_PAYABLE',

  // ── Tax & Payroll Liabilities ───────────────────────────────────
  SALES_TAX_PAYABLE: 'SALES_TAX_PAYABLE',
  PAYROLL_LIABILITIES: 'PAYROLL_LIABILITIES',
  PAYROLL_TAXES_PAYABLE: 'PAYROLL_TAXES_PAYABLE',
  TIPS_PAYABLE: 'TIPS_PAYABLE',

  // ── Deferred Revenue & Deposits ─────────────────────────────────
  GIFT_CARD_LIABILITY: 'GIFT_CARD_LIABILITY',
  CUSTOMER_DEPOSITS: 'CUSTOMER_DEPOSITS',
  MEMBERSHIP_DEPOSITS: 'MEMBERSHIP_DEPOSITS',
  EVENT_DEPOSITS: 'EVENT_DEPOSITS',

  // ── Equity ──────────────────────────────────────────────────────
  OWNER_CAPITAL: 'OWNER_CAPITAL',
  OWNER_DRAW: 'OWNER_DRAW',
  RETAINED_EARNINGS: 'RETAINED_EARNINGS',
  CURRENT_YEAR_EARNINGS: 'CURRENT_YEAR_EARNINGS',

  // ── Revenue (POS Categories) ────────────────────────────────────
  SALES_RETAIL: 'SALES_RETAIL',
  SALES_FOOD: 'SALES_FOOD',
  SALES_BEVERAGE_ALCOHOL: 'SALES_BEVERAGE_ALCOHOL',
  SALES_BEVERAGE_NON_ALCOHOL: 'SALES_BEVERAGE_NON_ALCOHOL',
  SALES_MERCHANDISE: 'SALES_MERCHANDISE',
  SALES_RENTAL: 'SALES_RENTAL',
  SALES_SERVICE: 'SALES_SERVICE',
  SALES_MEMBERSHIP: 'SALES_MEMBERSHIP',
  SALES_GREEN_FEES: 'SALES_GREEN_FEES',
  SALES_LESSONS: 'SALES_LESSONS',
  SALES_ROOM: 'SALES_ROOM',
  SALES_EVENT: 'SALES_EVENT',
  SALES_CATERING: 'SALES_CATERING',

  // ── Contra Revenue ──────────────────────────────────────────────
  DISCOUNTS_GIVEN: 'DISCOUNTS_GIVEN',
  REFUNDS_RETURNS: 'REFUNDS_RETURNS',
  COMPS: 'COMPS',

  // ── Cost of Goods Sold ──────────────────────────────────────────
  COGS_RETAIL: 'COGS_RETAIL',
  COGS_FOOD: 'COGS_FOOD',
  COGS_BEVERAGE_ALCOHOL: 'COGS_BEVERAGE_ALCOHOL',
  COGS_BEVERAGE_NON_ALCOHOL: 'COGS_BEVERAGE_NON_ALCOHOL',
  COGS_MERCHANDISE: 'COGS_MERCHANDISE',
  COGS_SUPPLIES: 'COGS_SUPPLIES',

  // ── Key Expenses ────────────────────────────────────────────────
  WAGES: 'WAGES',
  SALARIES: 'SALARIES',
  PAYMENT_PROCESSING_FEES: 'PAYMENT_PROCESSING_FEES',
  RENT_LEASE: 'RENT_LEASE',
  DEPRECIATION_EXPENSE: 'DEPRECIATION_EXPENSE',

  // ── Other Income / Expense ──────────────────────────────────────
  INTEREST_INCOME: 'INTEREST_INCOME',
  INTEREST_EXPENSE: 'INTEREST_EXPENSE',

  // ── System ──────────────────────────────────────────────────────
  ROUNDING_RECONCILIATION: 'ROUNDING_RECONCILIATION',
  SUSPENSE_CLEARING: 'SUSPENSE_CLEARING',
} as const;

export type AccountRole = (typeof ACCOUNT_ROLES)[keyof typeof ACCOUNT_ROLES];

// ── Default Account Numbers by Role ─────────────────────────────────
// This mapping is used ONLY during initial seed. At runtime, modules
// resolve by querying gl_accounts.account_role for the tenant.
export const DEFAULT_ACCOUNT_NUMBER_BY_ROLE: Record<AccountRole, string> = {
  // Cash & Banking
  CASH_OPERATING: '10100',
  CASH_PETTY: '10200',
  CASH_SAFE: '10300',
  UNDEPOSITED_FUNDS: '10400',
  MERCHANT_CLEARING: '10500',
  GIFT_CARD_CLEARING: '10600',

  // Receivables
  AR_CONTROL: '11000',
  AR_HOUSE: '11100',
  AR_CORPORATE: '11200',

  // Inventory
  INVENTORY_CONTROL: '12000',
  INVENTORY_RETAIL: '12100',
  INVENTORY_FOOD: '12200',
  INVENTORY_BEVERAGE: '12300',
  INVENTORY_SUPPLIES: '12400',
  INVENTORY_RENTAL: '12500',

  // Payables
  AP_CONTROL: '20000',
  CREDIT_CARDS_PAYABLE: '20100',
  MERCHANT_FEES_PAYABLE: '20200',

  // Tax & Payroll Liabilities
  SALES_TAX_PAYABLE: '21300',
  PAYROLL_LIABILITIES: '21100',
  PAYROLL_TAXES_PAYABLE: '21200',
  TIPS_PAYABLE: '21400',

  // Deferred Revenue & Deposits
  GIFT_CARD_LIABILITY: '22100',
  CUSTOMER_DEPOSITS: '22200',
  MEMBERSHIP_DEPOSITS: '22300',
  EVENT_DEPOSITS: '22400',

  // Equity
  OWNER_CAPITAL: '30100',
  OWNER_DRAW: '32000',
  RETAINED_EARNINGS: '31000',
  CURRENT_YEAR_EARNINGS: '31100',

  // Revenue (POS Categories)
  SALES_RETAIL: '40100',
  SALES_FOOD: '40200',
  SALES_BEVERAGE_ALCOHOL: '40300',
  SALES_BEVERAGE_NON_ALCOHOL: '40400',
  SALES_MERCHANDISE: '40500',
  SALES_RENTAL: '40600',
  SALES_SERVICE: '40700',
  SALES_MEMBERSHIP: '40800',
  SALES_GREEN_FEES: '40900',
  SALES_LESSONS: '41000',
  SALES_ROOM: '41100',
  SALES_EVENT: '41400',
  SALES_CATERING: '41600',

  // Contra Revenue
  DISCOUNTS_GIVEN: '49100',
  REFUNDS_RETURNS: '49300',
  COMPS: '49400',

  // COGS
  COGS_RETAIL: '50100',
  COGS_FOOD: '50200',
  COGS_BEVERAGE_ALCOHOL: '50300',
  COGS_BEVERAGE_NON_ALCOHOL: '50400',
  COGS_MERCHANDISE: '50500',
  COGS_SUPPLIES: '50600',

  // Key Expenses
  WAGES: '60100',
  SALARIES: '60200',
  PAYMENT_PROCESSING_FEES: '62300',
  RENT_LEASE: '61100',
  DEPRECIATION_EXPENSE: '81200',

  // Other Income / Expense
  INTEREST_INCOME: '80100',
  INTEREST_EXPENSE: '81100',

  // System
  ROUNDING_RECONCILIATION: '99910',
  SUSPENSE_CLEARING: '99920',
};

// ── Reverse lookup: account number → role ───────────────────────────
export const DEFAULT_ROLE_BY_ACCOUNT_NUMBER: Record<string, AccountRole> = Object.fromEntries(
  Object.entries(DEFAULT_ACCOUNT_NUMBER_BY_ROLE).map(([role, num]) => [num, role as AccountRole]),
) as Record<string, AccountRole>;
