import {
  BookOpen,
  FileSpreadsheet,
  ArrowRightLeft,
  Receipt,
  DollarSign,
  Truck,
  Clock,
  Wallet,
  CreditCard,
  Users,
  Building2,
  Banknote,
  PackageCheck,
  FileBarChart,
  BarChart3,
  Scale,
  Lock,
  Monitor,
  Repeat,
  CheckSquare,
  ClipboardList,
  ShieldCheck,
  Target,
  TrendingUp,
  Warehouse,
  Calendar,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface AccountingSectionTab {
  id: string;
  label: string;
  icon: LucideIcon;
  moduleKey?: string;
  /** Permission key required to see this tab */
  requiredPermission?: string;
}

export interface AccountingSection {
  id: string;
  label: string;
  href: string;
  tabs: AccountingSectionTab[];
  moduleKey?: string;
}

export const accountingSections: AccountingSection[] = [
  {
    id: 'gl',
    label: 'General Ledger',
    href: '/accounting/gl',
    tabs: [
      { id: 'chart-of-accounts', label: 'Chart of Accounts', icon: BookOpen, requiredPermission: 'accounting.view' },
      { id: 'journal-entries', label: 'Journal Entries', icon: FileSpreadsheet, requiredPermission: 'accounting.view' },
      { id: 'gl-mappings', label: 'GL Mappings', icon: ArrowRightLeft, requiredPermission: 'accounting.mappings.manage' },
      { id: 'recurring', label: 'Recurring Templates', icon: Repeat, requiredPermission: 'accounting.manage' },
    ],
  },
  {
    id: 'payables',
    label: 'Payables',
    href: '/accounting/payables',
    moduleKey: 'ap',
    tabs: [
      { id: 'bills', label: 'Bills', icon: Receipt, requiredPermission: 'ap.view' },
      { id: 'payments', label: 'Payments', icon: DollarSign, requiredPermission: 'ap.manage' },
      { id: 'vendors', label: 'Vendors', icon: Truck, requiredPermission: 'ap.view' },
      { id: 'aging', label: 'AP Aging', icon: Clock, requiredPermission: 'ap.view' },
    ],
  },
  {
    id: 'receivables',
    label: 'Receivables',
    href: '/accounting/receivables',
    moduleKey: 'ar',
    tabs: [
      { id: 'invoices', label: 'Invoices', icon: Wallet, requiredPermission: 'ar.view' },
      { id: 'receipts', label: 'Receipts', icon: CreditCard, requiredPermission: 'ar.manage' },
      { id: 'customers', label: 'Customers', icon: Users, requiredPermission: 'ar.view' },
      { id: 'aging', label: 'AR Aging', icon: Clock, requiredPermission: 'ar.view' },
    ],
  },
  {
    id: 'expenses',
    label: 'Expenses',
    href: '/accounting/expenses',
    tabs: [
      { id: 'all-expenses', label: 'All Expenses', icon: ClipboardList, requiredPermission: 'expenses.view' },
      { id: 'approvals', label: 'Approvals', icon: ShieldCheck, requiredPermission: 'expenses.approve' },
      { id: 'summary', label: 'Summary', icon: BarChart3, requiredPermission: 'expenses.view' },
      { id: 'policies', label: 'Policies', icon: FileBarChart, requiredPermission: 'expenses.manage' },
    ],
  },
  {
    id: 'banking',
    label: 'Banking',
    href: '/accounting/banking',
    tabs: [
      { id: 'bank-accounts', label: 'Bank Accounts', icon: Building2, requiredPermission: 'accounting.banking.view' },
      { id: 'deposits', label: 'Deposits', icon: Banknote, requiredPermission: 'accounting.banking.view' },
      { id: 'reconciliation', label: 'Reconciliation', icon: ArrowRightLeft, requiredPermission: 'accounting.banking.view' },
      { id: 'bank-rec', label: 'Bank Rec', icon: CheckSquare, requiredPermission: 'accounting.banking.reconcile' },
      { id: 'settlements', label: 'Settlements', icon: CreditCard, requiredPermission: 'accounting.banking.view' },
    ],
  },
  {
    id: 'revenue',
    label: 'Revenue & Cost',
    href: '/accounting/revenue',
    tabs: [
      { id: 'cogs', label: 'COGS', icon: PackageCheck, requiredPermission: 'cogs.manage' },
      { id: 'tip-payouts', label: 'Tip Payouts', icon: Banknote, requiredPermission: 'accounting.revenue.view' },
    ],
  },
  {
    id: 'tax',
    label: 'Tax',
    href: '/accounting/tax',
    tabs: [
      { id: 'remittance', label: 'Tax Remittance', icon: FileBarChart, requiredPermission: 'accounting.tax.view' },
      { id: 'reports', label: 'Tax Reports', icon: BarChart3, requiredPermission: 'accounting.tax.view' },
    ],
  },
  {
    id: 'budgets',
    label: 'Budgets',
    href: '/accounting/budgets',
    tabs: [
      { id: 'budgets', label: 'Budgets', icon: Target, requiredPermission: 'accounting.budgets.view' },
      { id: 'budget-vs-actual', label: 'Budget vs Actual', icon: TrendingUp, requiredPermission: 'accounting.budgets.view' },
    ],
  },
  {
    id: 'fixed-assets',
    label: 'Fixed Assets',
    href: '/accounting/fixed-assets',
    tabs: [
      { id: 'register', label: 'Asset Register', icon: Warehouse, requiredPermission: 'accounting.view' },
      { id: 'depreciation', label: 'Depreciation', icon: Calendar, requiredPermission: 'accounting.view' },
    ],
  },
  {
    id: 'financials',
    label: 'Financials',
    href: '/accounting/financials',
    tabs: [
      { id: 'reports', label: 'Reports', icon: BarChart3, requiredPermission: 'accounting.financials.view' },
      { id: 'statements', label: 'Statements', icon: Scale, requiredPermission: 'accounting.financials.view' },
    ],
  },
  {
    id: 'period-close',
    label: 'Period Close',
    href: '/accounting/period-close',
    tabs: [
      { id: 'operations', label: 'Operations', icon: Monitor, requiredPermission: 'accounting.view' },
      { id: 'close-dashboard', label: 'Close Dashboard', icon: Clock, requiredPermission: 'accounting.period.close' },
      { id: 'period-close', label: 'Period Locks', icon: Lock, requiredPermission: 'accounting.period.close' },
    ],
  },
];

/** Get section config by ID */
export function getAccountingSection(sectionId: string): AccountingSection | undefined {
  return accountingSections.find((s) => s.id === sectionId);
}
