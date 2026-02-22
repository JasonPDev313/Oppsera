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
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface AccountingSectionTab {
  id: string;
  label: string;
  icon: LucideIcon;
  moduleKey?: string;
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
      { id: 'chart-of-accounts', label: 'Chart of Accounts', icon: BookOpen },
      { id: 'journal-entries', label: 'Journal Entries', icon: FileSpreadsheet },
      { id: 'gl-mappings', label: 'GL Mappings', icon: ArrowRightLeft },
      { id: 'recurring', label: 'Recurring Templates', icon: Repeat },
    ],
  },
  {
    id: 'payables',
    label: 'Payables',
    href: '/accounting/payables',
    moduleKey: 'ap',
    tabs: [
      { id: 'bills', label: 'Bills', icon: Receipt },
      { id: 'payments', label: 'Payments', icon: DollarSign },
      { id: 'vendors', label: 'Vendors', icon: Truck },
      { id: 'aging', label: 'AP Aging', icon: Clock },
    ],
  },
  {
    id: 'receivables',
    label: 'Receivables',
    href: '/accounting/receivables',
    moduleKey: 'ar',
    tabs: [
      { id: 'invoices', label: 'Invoices', icon: Wallet },
      { id: 'receipts', label: 'Receipts', icon: CreditCard },
      { id: 'customers', label: 'Customers', icon: Users },
      { id: 'aging', label: 'AR Aging', icon: Clock },
    ],
  },
  {
    id: 'banking',
    label: 'Banking',
    href: '/accounting/banking',
    tabs: [
      { id: 'bank-accounts', label: 'Bank Accounts', icon: Building2 },
      { id: 'deposits', label: 'Deposits', icon: Banknote },
      { id: 'reconciliation', label: 'Reconciliation', icon: ArrowRightLeft },
      { id: 'bank-rec', label: 'Bank Rec', icon: CheckSquare },
      { id: 'settlements', label: 'Settlements', icon: CreditCard },
    ],
  },
  {
    id: 'revenue',
    label: 'Revenue & Cost',
    href: '/accounting/revenue',
    tabs: [
      { id: 'cogs', label: 'COGS', icon: PackageCheck },
      { id: 'tip-payouts', label: 'Tip Payouts', icon: Banknote },
    ],
  },
  {
    id: 'tax',
    label: 'Tax',
    href: '/accounting/tax',
    tabs: [
      { id: 'remittance', label: 'Tax Remittance', icon: FileBarChart },
      { id: 'reports', label: 'Tax Reports', icon: BarChart3 },
    ],
  },
  {
    id: 'financials',
    label: 'Financials',
    href: '/accounting/financials',
    tabs: [
      { id: 'reports', label: 'Reports', icon: BarChart3 },
      { id: 'statements', label: 'Statements', icon: Scale },
    ],
  },
  {
    id: 'period-close',
    label: 'Period Close',
    href: '/accounting/period-close',
    tabs: [
      { id: 'operations', label: 'Operations', icon: Monitor },
      { id: 'close-dashboard', label: 'Close Dashboard', icon: Clock },
      { id: 'period-close', label: 'Period Locks', icon: Lock },
    ],
  },
];

/** Get section config by ID */
export function getAccountingSection(sectionId: string): AccountingSection | undefined {
  return accountingSections.find((s) => s.id === sectionId);
}
