'use client';

import {
  DollarSign,
  TrendingUp,
  Wallet,
  CreditCard,
  Receipt,
  AlertTriangle,
  CheckCircle2,
  Printer,
  ArrowRight,
  FileText,
  PieChart,
  Landmark,
  ShieldCheck,
} from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { useHealthSummary, useClosePeriods } from '@/hooks/use-statements';
import { formatAccountingMoney } from '@/types/accounting';
import type { ClosePeriod } from '@/types/accounting';
import Link from 'next/link';

// ── KPICard ──────────────────────────────────────────────────

function KPICard({
  icon: Icon,
  label,
  value,
  accent,
  href,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  accent: string;
  href?: string;
}) {
  const card = (
    <div className={`rounded-lg border border-border bg-surface p-4 print:border-gray-300 print:bg-gray-100 ${href ? 'hover:bg-accent transition-colors cursor-pointer' : ''}`}>
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2 ${accent}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-lg font-semibold tabular-nums text-foreground">{value}</p>
        </div>
        {href && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{card}</Link>;
  }
  return card;
}

// ── Section card ─────────────────────────────────────────────

function SectionCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5 print:border-gray-300 print:bg-gray-100 print:break-inside-avoid">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {title}
      </div>
      {children}
    </div>
  );
}

// ── Coverage meter ───────────────────────────────────────────

function CoverageMeter({
  label,
  mapped,
  total,
}: {
  label: string;
  mapped: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((mapped / total) * 100) : 100;
  const color = pct >= 90 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums text-foreground">
          {mapped}/{total} ({pct}%)
        </span>
      </div>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={color} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Period status badge ──────────────────────────────────────

const PERIOD_STATUS_COLORS: Record<string, string> = {
  open: 'bg-green-500/10 text-green-500 border-green-500/30',
  in_review: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
  closed: 'bg-muted text-muted-foreground border-border',
};

// ── Main ─────────────────────────────────────────────────────

export default function FinancialDashboardContent() {
  const { data: health, isLoading: healthLoading } = useHealthSummary();
  const { data: closePeriods, isLoading: periodsLoading } = useClosePeriods();

  const isLoading = healthLoading || periodsLoading;

  return (
    <AccountingPageShell
      title="Financial Dashboard"
      breadcrumbs={[
        { label: 'Reports', href: '/accounting/reports' },
        { label: 'Financial Dashboard' },
      ]}
    >
      {/* Print header */}
      <div className="hidden print:block print:mb-4">
        <h1 className="text-xl font-bold text-foreground">Financial Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Generated {new Date().toLocaleDateString()}
        </p>
      </div>

      {/* Print button */}
      <div className="flex justify-end print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded border border-border p-1.5 text-muted-foreground hover:bg-accent"
          title="Print"
        >
          <Printer className="h-4 w-4" />
        </button>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        </div>
      )}

      {!isLoading && health && (
        <>
          {/* KPI Cards - Row 1 */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KPICard
              icon={TrendingUp}
              label="Net Income"
              value={formatAccountingMoney(Number(health.netIncome) || 0)}
              accent={
                (Number(health.netIncome) || 0) >= 0
                  ? 'bg-green-500/10 text-green-500'
                  : 'bg-red-500/10 text-red-500'
              }
              href="/accounting/reports/summary"
            />
            <KPICard
              icon={Wallet}
              label="Cash Balance"
              value={formatAccountingMoney(Number(health.cashBalance) || 0)}
              accent="bg-blue-500/10 text-blue-500"
            />
            <KPICard
              icon={CreditCard}
              label="AP Balance"
              value={formatAccountingMoney(Number(health.apBalance) || 0)}
              accent="bg-amber-500/10 text-amber-500"
              href="/accounting/reports/ap-aging"
            />
            <KPICard
              icon={Receipt}
              label="AR Balance"
              value={formatAccountingMoney(Number(health.arBalance) || 0)}
              accent="bg-indigo-500/10 text-indigo-500"
              href="/accounting/reports/ar-aging"
            />
          </div>

          {/* KPI Cards - Row 2 */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KPICard
              icon={DollarSign}
              label="Working Capital"
              value={formatAccountingMoney(Number(health.workingCapital) || 0)}
              accent={
                (Number(health.workingCapital) || 0) >= 0
                  ? 'bg-green-500/10 text-green-500'
                  : 'bg-red-500/10 text-red-500'
              }
            />
            <KPICard
              icon={PieChart}
              label="GL Mapping"
              value={`${health.mappingCoverage?.overallPercentage ?? 0}%`}
              accent={
                (health.mappingCoverage?.overallPercentage ?? 0) >= 90
                  ? 'bg-green-500/10 text-green-500'
                  : 'bg-amber-500/10 text-amber-500'
              }
              href="/accounting/mappings"
            />
            <KPICard
              icon={AlertTriangle}
              label="Unmapped Events"
              value={String(health.unmappedEventCount ?? 0)}
              accent={
                (health.unmappedEventCount ?? 0) === 0
                  ? 'bg-green-500/10 text-green-500'
                  : 'bg-red-500/10 text-red-500'
              }
              href="/accounting/mappings"
            />
            <KPICard
              icon={FileText}
              label="Recent Journals"
              value={String(health.recentJournals?.length ?? 0)}
              accent="bg-muted text-muted-foreground"
              href="/accounting/reports/journal-entries"
            />
          </div>

          {/* Detail sections */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* GL Mapping Coverage */}
            <SectionCard title="GL Mapping Coverage" icon={PieChart}>
              {health.mappingCoverage ? (
                <div className="space-y-3">
                  <CoverageMeter
                    label="Sub-Departments"
                    mapped={health.mappingCoverage.departments?.mapped ?? 0}
                    total={health.mappingCoverage.departments?.total ?? 0}
                  />
                  <CoverageMeter
                    label="Payment Types"
                    mapped={health.mappingCoverage.paymentTypes?.mapped ?? 0}
                    total={health.mappingCoverage.paymentTypes?.total ?? 0}
                  />
                  <CoverageMeter
                    label="Tax Groups"
                    mapped={health.mappingCoverage.taxGroups?.mapped ?? 0}
                    total={health.mappingCoverage.taxGroups?.total ?? 0}
                  />
                  <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                    <span className="text-sm font-medium text-foreground">Overall</span>
                    <span
                      className={`text-sm font-semibold tabular-nums ${
                        (health.mappingCoverage.overallPercentage ?? 0) >= 90
                          ? 'text-green-500'
                          : 'text-amber-500'
                      }`}
                    >
                      {health.mappingCoverage.overallPercentage ?? 0}%
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No mapping data available.</p>
              )}
            </SectionCard>

            {/* Current Period */}
            <SectionCard title="Current Period" icon={Landmark}>
              {health.currentPeriod ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Period</span>
                    <span className="text-sm font-medium text-foreground">
                      {health.currentPeriod.postingPeriod}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                        PERIOD_STATUS_COLORS[health.currentPeriod.status] ??
                        'bg-muted text-muted-foreground border-border'
                      }`}
                    >
                      {health.currentPeriod.status === 'in_review'
                        ? 'In Review'
                        : health.currentPeriod.status.charAt(0).toUpperCase() +
                          health.currentPeriod.status.slice(1)}
                    </span>
                  </div>
                  {health.currentPeriod.checklist && (
                    <div className="space-y-1.5">
                      {health.currentPeriod.checklist.slice(0, 5).map((item, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          {item.status === 'pass' ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                          ) : item.status === 'fail' ? (
                            <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                          ) : (
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                          )}
                          <span className="text-muted-foreground">{item.label}</span>
                        </div>
                      ))}
                      {health.currentPeriod.checklist.length > 5 && (
                        <Link
                          href="/accounting/reports/period-close"
                          className="mt-1 text-xs text-indigo-500 hover:text-indigo-400"
                        >
                          View all {health.currentPeriod.checklist.length} items →
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No active posting period.</p>
              )}
            </SectionCard>

            {/* Recent Journals */}
            <SectionCard title="Recent Journal Entries" icon={FileText}>
              {health.recentJournals && health.recentJournals.length > 0 ? (
                <div className="space-y-2">
                  {health.recentJournals.slice(0, 5).map((j) => (
                    <div
                      key={j.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="tabular-nums text-muted-foreground">
                          {j.journalNumber ?? j.id.slice(0, 8)}
                        </span>
                        {j.memo && (
                          <span className="ml-2 truncate text-foreground">{j.memo}</span>
                        )}
                      </div>
                      <span className="ml-3 tabular-nums text-foreground">
                        {formatAccountingMoney(
                          (j.lines ?? []).reduce((s, l) => s + (l.debitAmount || 0), 0),
                        )}
                      </span>
                    </div>
                  ))}
                  <Link
                    href="/accounting/reports/journal-entries"
                    className="mt-1 block text-xs text-indigo-500 hover:text-indigo-400"
                  >
                    View all journal entries →
                  </Link>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No recent journal entries.</p>
              )}
            </SectionCard>

            {/* Close Periods */}
            <SectionCard title="Period History" icon={ShieldCheck}>
              {closePeriods && closePeriods.length > 0 ? (
                <div className="space-y-2">
                  {closePeriods.slice(0, 5).map((p: ClosePeriod) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-foreground">{p.postingPeriod}</span>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                          PERIOD_STATUS_COLORS[p.status] ??
                          'bg-muted text-muted-foreground border-border'
                        }`}
                      >
                        {p.status === 'in_review'
                          ? 'In Review'
                          : p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                      </span>
                    </div>
                  ))}
                  <Link
                    href="/accounting/reports/period-close"
                    className="mt-1 block text-xs text-indigo-500 hover:text-indigo-400"
                  >
                    View all periods →
                  </Link>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No close periods recorded.</p>
              )}
            </SectionCard>
          </div>

          {/* Print footer */}
          <div className="hidden print:block print:mt-6 print:border-t print:border-gray-300 print:pt-2">
            <p className="text-xs text-muted-foreground">
              Generated {new Date().toLocaleDateString()} — Financial Dashboard
            </p>
          </div>
        </>
      )}

      {/* Empty state */}
      {!isLoading && !health && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <DollarSign className="h-12 w-12 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            Financial health data not available. Ensure accounting is bootstrapped.
          </p>
        </div>
      )}
    </AccountingPageShell>
  );
}
