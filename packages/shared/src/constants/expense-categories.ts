// ── Expense Categories ──────────────────────────────────────────────────────

export const EXPENSE_CATEGORIES = {
  meals: { label: 'Meals & Dining', description: 'Business meals and dining expenses' },
  travel: { label: 'Travel', description: 'Airfare, lodging, ground transport' },
  supplies: { label: 'Office Supplies', description: 'Office and operational supplies' },
  equipment: { label: 'Equipment', description: 'Tools, small equipment purchases' },
  professional_services: { label: 'Professional Services', description: 'Consulting, legal, accounting fees' },
  utilities: { label: 'Utilities', description: 'Phone, internet, utility bills' },
  rent: { label: 'Rent & Occupancy', description: 'Office rent and lease payments' },
  insurance: { label: 'Insurance', description: 'Business insurance premiums' },
  training: { label: 'Training & Education', description: 'Courses, seminars, certifications' },
  entertainment: { label: 'Entertainment', description: 'Client entertainment, events' },
  marketing: { label: 'Marketing & Advertising', description: 'Ads, promotions, marketing materials' },
  vehicle: { label: 'Vehicle & Mileage', description: 'Fuel, maintenance, mileage reimbursement' },
  subscriptions: { label: 'Subscriptions & Software', description: 'SaaS, periodicals, memberships' },
  other: { label: 'Other', description: 'Uncategorized expenses' },
} as const;

export type ExpenseCategory = keyof typeof EXPENSE_CATEGORIES;

// ── Expense Statuses ────────────────────────────────────────────────────────

export const EXPENSE_STATUSES = {
  draft: { label: 'Draft', description: 'Not yet submitted' },
  submitted: { label: 'Submitted', description: 'Awaiting approval' },
  approved: { label: 'Approved', description: 'Approved, pending GL posting' },
  rejected: { label: 'Rejected', description: 'Rejected by approver' },
  posted: { label: 'Posted', description: 'GL entry created' },
  voided: { label: 'Voided', description: 'Cancelled after posting' },
} as const;

export type ExpenseStatus = keyof typeof EXPENSE_STATUSES;

// ── Payment Methods ─────────────────────────────────────────────────────────

export const EXPENSE_PAYMENT_METHODS = {
  personal_card: { label: 'Personal Card', description: 'Employee personal credit/debit card' },
  company_card: { label: 'Company Card', description: 'Company-issued credit card' },
  cash: { label: 'Cash', description: 'Cash out of pocket' },
  petty_cash: { label: 'Petty Cash', description: 'Company petty cash fund' },
} as const;

export type ExpensePaymentMethod = keyof typeof EXPENSE_PAYMENT_METHODS;

// ── Reimbursement Methods ───────────────────────────────────────────────────

export const REIMBURSEMENT_METHODS = {
  direct_deposit: { label: 'Direct Deposit', description: 'ACH to employee bank account' },
  check: { label: 'Check', description: 'Paper check' },
  payroll_deduction: { label: 'Payroll Addition', description: 'Added to next payroll run' },
} as const;

export type ReimbursementMethod = keyof typeof REIMBURSEMENT_METHODS;

// ── Status transition validation ────────────────────────────────────────────

export const EXPENSE_STATUS_TRANSITIONS: Record<ExpenseStatus, ExpenseStatus[]> = {
  draft: ['submitted'],
  submitted: ['approved', 'rejected'],
  approved: ['posted'],
  rejected: ['submitted'], // can resubmit after edits
  posted: ['voided'],
  voided: [],
};
