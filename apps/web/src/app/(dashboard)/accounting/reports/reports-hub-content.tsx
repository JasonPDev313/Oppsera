'use client';

import {
  BarChart3,
  FileText,
  TrendingUp,
  Landmark,
  Receipt,
  CreditCard,
  Wallet,
  Package,
  ShieldCheck,
  ClipboardList,
  PieChart,
  FileBarChart,
  ArrowRight,
  Scale,
  Calculator,
  Activity,
  Target,
  Clock,
  Building2,
  Building,
} from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import Link from 'next/link';

// ── Report card ──────────────────────────────────────────────

function ReportCard({
  icon: Icon,
  title,
  description,
  href,
  accent,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  href: string;
  accent: string;
}) {
  return (
    <Link href={href}>
      <div className="group flex h-full items-start gap-4 rounded-lg border border-border bg-surface p-4 transition-colors hover:bg-accent">
        <div className={`shrink-0 rounded-lg p-2.5 ${accent}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
    </Link>
  );
}

// ── Section header ───────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  count,
}: {
  icon: React.ElementType;
  title: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border pb-2">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
        {count}
      </span>
    </div>
  );
}

// ── Report categories ────────────────────────────────────────

const REPORT_CATEGORIES = [
  {
    title: 'Financial Statements',
    icon: TrendingUp,
    reports: [
      {
        icon: BarChart3,
        title: 'Profit & Loss',
        description:
          'Revenue, expenses, and net income for a selected period with comparative analysis.',
        href: '/accounting/statements/profit-loss',
        accent: 'bg-green-500/10 text-green-500',
      },
      {
        icon: Scale,
        title: 'Balance Sheet',
        description:
          'Assets, liabilities, and equity as of a specific date. Validates A = L + E.',
        href: '/accounting/statements/balance-sheet',
        accent: 'bg-blue-500/10 text-blue-500',
      },
      {
        icon: Wallet,
        title: 'Cash Flow Statement',
        description:
          'Cash inflows and outflows organized by operating, investing, and financing activities.',
        href: '/accounting/reports/cash-flow-forecast',
        accent: 'bg-indigo-500/10 text-indigo-500',
      },
      {
        icon: Building2,
        title: 'Multi-Location P&L',
        description:
          'Consolidated profit & loss across locations with per-location columns and variance analysis.',
        href: '/accounting/reports/consolidated-pl',
        accent: 'bg-teal-500/10 text-teal-500',
      },
    ],
  },
  {
    title: 'GL & Accounting',
    icon: Landmark,
    reports: [
      {
        icon: Calculator,
        title: 'Trial Balance',
        description:
          'Debit and credit balances for all accounts. Validates total debits equal total credits.',
        href: '/accounting/reports/trial-balance',
        accent: 'bg-purple-500/10 text-purple-500',
      },
      {
        icon: FileBarChart,
        title: 'GL Code Summary',
        description:
          'Revenue, expense, and balance details grouped by GL code with collapsible sections.',
        href: '/accounting/reports/gl-code-summary',
        accent: 'bg-cyan-500/10 text-cyan-500',
      },
      {
        icon: FileText,
        title: 'GL Detail',
        description:
          'Line-by-line transaction detail for any GL account over a date range.',
        href: '/accounting/reports/detail',
        accent: 'bg-teal-500/10 text-teal-500',
      },
      {
        icon: ClipboardList,
        title: 'Journal Entries',
        description:
          'Browse and search all journal entries with line-level drill-down and source tracing.',
        href: '/accounting/reports/journal-entries',
        accent: 'bg-amber-500/10 text-amber-500',
      },
      {
        icon: Clock,
        title: 'Aged Trial Balance',
        description:
          'Account balances bucketed by age (Current, 1–30, 31–60, 61–90, 90+) with grand totals.',
        href: '/accounting/reports/aged-trial-balance',
        accent: 'bg-rose-500/10 text-rose-500',
      },
    ],
  },
  {
    title: 'Receivables & Payables',
    icon: CreditCard,
    reports: [
      {
        icon: Receipt,
        title: 'AR Aging',
        description:
          'Accounts receivable aging buckets (Current, 1–30, 31–60, 61–90, 90+) by customer.',
        href: '/accounting/reports/ar-aging',
        accent: 'bg-indigo-500/10 text-indigo-500',
      },
      {
        icon: CreditCard,
        title: 'AP Aging',
        description:
          'Accounts payable aging buckets by vendor with payment due dates and overdue amounts.',
        href: '/accounting/reports/ap-aging',
        accent: 'bg-amber-500/10 text-amber-500',
      },
    ],
  },
  {
    title: 'Tax',
    icon: Receipt,
    reports: [
      {
        icon: Receipt,
        title: 'Sales Tax Liability',
        description:
          'Tax collected, remitted, and net liability by tax group for filing preparation.',
        href: '/accounting/reports/sales-tax',
        accent: 'bg-rose-500/10 text-rose-500',
      },
      {
        icon: FileText,
        title: 'Tax Remittance',
        description:
          'Jurisdiction-level tax remittance tracking by authority and filing frequency.',
        href: '/accounting/reports/tax-remittance',
        accent: 'bg-orange-500/10 text-orange-500',
      },
    ],
  },
  {
    title: 'Cash & Banking',
    icon: Wallet,
    reports: [
      {
        icon: Wallet,
        title: 'Bank Reconciliation',
        description:
          'Track bank statement reconciliations with status, cleared items, and variance.',
        href: '/accounting/reports/bank-reconciliation',
        accent: 'bg-sky-500/10 text-sky-500',
      },
      {
        icon: TrendingUp,
        title: 'Cash Flow Forecast',
        description:
          'Forward-looking cash projection using AP due dates, AR receipts, and recurring entries.',
        href: '/accounting/reports/cash-flow-forecast',
        accent: 'bg-emerald-500/10 text-emerald-500',
      },
    ],
  },
  {
    title: 'Inventory & COGS',
    icon: Package,
    reports: [
      {
        icon: Package,
        title: 'Inventory Valuation',
        description:
          'On-hand quantities, reorder points, and stock status for all inventory items.',
        href: '/accounting/reports/inventory-valuation',
        accent: 'bg-emerald-500/10 text-emerald-500',
      },
    ],
  },
  {
    title: 'Budgeting',
    icon: Target,
    reports: [
      {
        icon: Target,
        title: 'Budget vs Actual',
        description:
          'Variance analysis comparing budgeted amounts to actual GL activity by account and period.',
        href: '/accounting/reports/budget-vs-actual',
        accent: 'bg-indigo-500/10 text-indigo-500',
      },
    ],
  },
  {
    title: 'Fixed Assets',
    icon: Building,
    reports: [
      {
        icon: Building,
        title: 'Asset Register Summary',
        description:
          'Total assets, net book value, and monthly depreciation by category with fully depreciated counts.',
        href: '/accounting/reports/fixed-asset-summary',
        accent: 'bg-stone-500/10 text-stone-500',
      },
      {
        icon: Calculator,
        title: 'Depreciation Schedule',
        description:
          'Projected depreciation for each fixed asset showing period amounts, accumulated totals, and net book value.',
        href: '/accounting/fixed-assets',
        accent: 'bg-slate-500/10 text-slate-500',
      },
    ],
  },
  {
    title: 'Management & Analytics',
    icon: PieChart,
    reports: [
      {
        icon: Activity,
        title: 'Financial Dashboard',
        description:
          'KPI overview with net income, cash, AP/AR balances, mapping coverage, and period status.',
        href: '/accounting/reports/financial-dashboard',
        accent: 'bg-violet-500/10 text-violet-500',
      },
    ],
  },
  {
    title: 'Audit & Compliance',
    icon: ShieldCheck,
    reports: [
      {
        icon: ShieldCheck,
        title: 'Audit Trail',
        description:
          'Audit coverage analysis and chronological activity log for all accounting operations.',
        href: '/accounting/reports/audit-trail',
        accent: 'bg-fuchsia-500/10 text-fuchsia-500',
      },
      {
        icon: ClipboardList,
        title: 'Period Close',
        description:
          'Period close status, readiness checklist, and historical close records.',
        href: '/accounting/reports/period-close',
        accent: 'bg-pink-500/10 text-pink-500',
      },
    ],
  },
];

// ── Main ─────────────────────────────────────────────────────

export default function ReportsHubContent() {
  const totalReports = REPORT_CATEGORIES.reduce(
    (sum, cat) => sum + cat.reports.length,
    0,
  );

  return (
    <AccountingPageShell
      title="Accounting Reports"
      subtitle={`${totalReports} reports across ${REPORT_CATEGORIES.length} categories`}
      breadcrumbs={[{ label: 'Reports' }]}
    >
      {/* Print header */}
      <div className="hidden print:block print:mb-4">
        <h1 className="text-xl font-bold text-foreground">
          Accounting Reports
        </h1>
        <p className="text-sm text-muted-foreground">
          {totalReports} reports available
        </p>
      </div>

      {/* Category sections */}
      <div className="space-y-8">
        {REPORT_CATEGORIES.map((category) => (
          <section key={category.title}>
            <SectionHeader
              icon={category.icon}
              title={category.title}
              count={category.reports.length}
            />
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {category.reports.map((report) => (
                <ReportCard key={report.href} {...report} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Print footer */}
      <div className="hidden print:block print:mt-6 print:border-t print:border-gray-300 print:pt-2">
        <p className="text-xs text-muted-foreground">
          Generated {new Date().toLocaleDateString()} — Accounting Reports
          Directory
        </p>
      </div>
    </AccountingPageShell>
  );
}
