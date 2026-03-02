'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import {
  FileSpreadsheet,
  Scale,
  Receipt,
  Lock,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Wallet,
  ShieldCheck,
  CheckCircle,
  Landmark,
} from 'lucide-react';
import { AccountingPageShell } from '@/components/accounting/accounting-page-shell';
import { AccountingEmptyState } from '@/components/accounting/accounting-empty-state';
import { BootstrapWizard } from '@/components/accounting/bootstrap-wizard';
import { GLReadinessBanner } from '@/components/accounting/gl-readiness-banner';
import { StatusBadge } from '@/components/accounting/status-badge';
import { formatAccountingMoney } from '@/types/accounting';
import type { HealthSummary } from '@/types/accounting';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { useAuditCoverage } from '@/hooks/use-audit';
import { useAccountingBootstrapStatus } from '@/hooks/use-accounting';

// ── Quick link definitions ────────────────────────────────────

const QUICK_LINKS = [
  { label: 'Record Journal Entry', href: '/accounting/journals/new', icon: FileSpreadsheet },
  { label: 'Enter AP Bill', href: '/ap/bills/new', icon: Receipt },
  { label: 'Create Invoice', href: '/ar/invoices/new', icon: Wallet },
  { label: 'View Trial Balance', href: '/accounting/reports/trial-balance', icon: Scale },
  { label: 'Close Period', href: '/accounting/close', icon: Lock },
];

// ── KPI Card ──────────────────────────────────────────────────

function KPICard({
  label,
  value,
  icon: Icon,
  trend,
}: {
  label: string;
  value: string;
  icon: typeof DollarSign;
  trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums text-foreground">{value}</span>
        {trend === 'up' && <TrendingUp className="h-4 w-4 text-green-500" />}
        {trend === 'down' && <TrendingDown className="h-4 w-4 text-red-500" />}
      </div>
    </div>
  );
}

// ── Main Content ──────────────────────────────────────────────

function getDefaultDateRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default function AccountingDashboardContent() {
  const queryClient = useQueryClient();
  const { isBootstrapped, isLoading: bootstrapLoading } = useAccountingBootstrapStatus();
  const [showBootstrap, setShowBootstrap] = useState(false);
  const [bootstrapJustCompleted, setBootstrapJustCompleted] = useState(false);

  const handleBootstrapComplete = useCallback(async () => {
    // Await refetches so cache is fully populated before hiding the wizard
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ['accounting-settings'] }),
      queryClient.refetchQueries({ queryKey: ['gl-accounts'] }),
      queryClient.refetchQueries({ queryKey: ['accounting-health-summary'] }),
    ]);
    setBootstrapJustCompleted(true);
    setShowBootstrap(false);
  }, [queryClient]);

  const { data: health, isLoading } = useQuery({
    queryKey: ['accounting-health-summary'],
    queryFn: () =>
      apiFetch<{ data: HealthSummary }>('/api/v1/accounting/statements/health-summary')
        .then((r) => r.data)
        .catch(() => null),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const dateRange = getDefaultDateRange();
  const { data: auditCoverage } = useAuditCoverage(dateRange);

  // Loading skeleton while bootstrap status is being determined
  if (bootstrapLoading) {
    return (
      <AccountingPageShell title="Accounting Dashboard" subtitle="Financial overview and quick actions">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-border bg-surface p-5">
                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                <div className="mt-3 h-7 w-32 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          </div>
        </div>
      </AccountingPageShell>
    );
  }

  // Show bootstrap wizard if not bootstrapped (and bootstrap didn't just finish)
  if (!isBootstrapped && !bootstrapJustCompleted) {
    return (
      <AccountingPageShell title="Accounting Dashboard" subtitle="Financial overview and quick actions">
        {showBootstrap ? (
          <BootstrapWizard onComplete={handleBootstrapComplete} />
        ) : (
          <AccountingEmptyState
            title="Accounting not configured"
            description="Set up your chart of accounts to start tracking finances. Choose a template to get started quickly."
            action={{ label: 'Set Up Accounting', onClick: () => setShowBootstrap(true) }}
          />
        )}
      </AccountingPageShell>
    );
  }

  // Show inline bootstrap wizard when re-running from configured state
  if (showBootstrap) {
    return (
      <AccountingPageShell title="Accounting Dashboard" subtitle="Financial overview and quick actions">
        <BootstrapWizard onComplete={handleBootstrapComplete} />
      </AccountingPageShell>
    );
  }

  return (
    <AccountingPageShell title="Accounting Dashboard" subtitle="Financial overview and quick actions">
      {/* Bootstrap Status */}
      <div className="flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm">
        <CheckCircle className="h-5 w-5 shrink-0 text-green-500" />
        <span className="flex-1 text-green-500">
          <strong>Chart of Accounts configured</strong>
        </span>
        <button
          type="button"
          onClick={() => setShowBootstrap(true)}
          className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Landmark className="h-3.5 w-3.5" />
          Re-run Setup
        </button>
      </div>

      {/* GL Mapping Prompt — shown after bootstrap or when mappings are incomplete */}
      {(bootstrapJustCompleted || (health?.mappingCoverage && health.mappingCoverage.overallPercentage < 100)) && (
        <Link
          href="/accounting/mappings"
          className="flex items-center gap-3 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-400 transition-colors hover:bg-indigo-500/20"
        >
          <FileSpreadsheet className="h-5 w-5 shrink-0 text-indigo-400" />
          <span className="flex-1">
            <strong>Next step:</strong> Configure GL code mappings to connect your sales, payments, and tax data to the general ledger.
          </span>
          <span className="shrink-0 text-xs font-medium text-indigo-400">Configure Mappings &rarr;</span>
        </Link>
      )}

      {/* GL Readiness — auto-detects and backfills unposted tenders */}
      <GLReadinessBanner />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          label="Net Income"
          value={health ? formatAccountingMoney(health.netIncome) : '—'}
          icon={TrendingUp}
        />
        <KPICard
          label="Cash Balance"
          value={health ? formatAccountingMoney(health.cashBalance) : '—'}
          icon={DollarSign}
        />
        <KPICard
          label="AP Balance"
          value={health ? formatAccountingMoney(health.apBalance) : '—'}
          icon={Receipt}
        />
        <KPICard
          label="AR Balance"
          value={health ? formatAccountingMoney(health.arBalance) : '—'}
          icon={Wallet}
        />
      </div>

      {/* Unmapped Events Alert */}
      {health && health.unmappedEventCount > 0 && (
        <Link
          href="/accounting/mappings"
          className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-500 transition-colors hover:bg-amber-500/20"
        >
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
          <span>
            <strong>{health.unmappedEventCount}</strong> unmapped event{health.unmappedEventCount !== 1 ? 's' : ''} need GL mapping configuration
          </span>
        </Link>
      )}

      {/* Quick Links + Recent Activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Quick Links */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Quick Actions</h2>
          <div className="space-y-2">
            {QUICK_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-indigo-500"
              >
                <link.icon className="h-5 w-5 text-muted-foreground" />
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Recent Journal Entries */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Recent Journal Entries</h2>
            <Link
              href="/accounting/journals"
              className="text-xs font-medium text-indigo-500 hover:text-indigo-400"
            >
              View all
            </Link>
          </div>
          <div className="space-y-2">
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border border-border p-4">
                  <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-48 animate-pulse rounded bg-muted" />
                  <div className="ml-auto h-4 w-20 animate-pulse rounded bg-muted" />
                </div>
              ))}
            {!isLoading && health?.recentJournals && health.recentJournals.length > 0 ? (
              health.recentJournals.map((journal) => (
                <Link
                  key={journal.id}
                  href={`/accounting/journals/${journal.id}`}
                  className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 transition-colors hover:bg-accent"
                >
                  <span className="text-sm font-mono text-muted-foreground">#{journal.journalNumber}</span>
                  <span className="flex-1 truncate text-sm text-foreground">
                    {journal.memo ?? journal.sourceModule}
                  </span>
                  <StatusBadge status={journal.status} />
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {journal.businessDate}
                  </span>
                </Link>
              ))
            ) : (
              !isLoading && (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-8 text-center">
                  <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">No journal entries yet</p>
                  <Link
                    href="/accounting/journals/new"
                    className="mt-2 text-sm font-medium text-indigo-500 hover:text-indigo-400"
                  >
                    Create your first entry
                  </Link>
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {/* Data Integrity Card */}
      {auditCoverage && (
        <Link
          href="/accounting/audit"
          className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-colors ${
            auditCoverage.totalGaps === 0
              ? 'border-green-500/30 bg-green-500/10 text-green-500 hover:bg-green-500/20'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20'
          }`}
        >
          <ShieldCheck className={`h-5 w-5 shrink-0 ${auditCoverage.totalGaps === 0 ? 'text-green-500' : 'text-amber-500'}`} />
          <span>
            <strong>{auditCoverage.totalAuditEntries}</strong> audit entries / <strong>{auditCoverage.totalTransactions}</strong> financial transactions
            {auditCoverage.totalGaps > 0
              ? ` — ${auditCoverage.totalGaps} gap${auditCoverage.totalGaps !== 1 ? 's' : ''} detected`
              : ' — full coverage'}
          </span>
        </Link>
      )}

      {/* Mapping Coverage + Period Close Status */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Mapping Coverage */}
        <div className="rounded-lg border border-border bg-surface p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Mapping Coverage</h3>
            <Link
              href="/accounting/mappings"
              className="text-xs font-medium text-indigo-500 hover:text-indigo-400"
            >
              Configure
            </Link>
          </div>
          {health?.mappingCoverage ? (
            <div className="mt-3 space-y-2">
              <CoverageBar
                label="Departments"
                mapped={health.mappingCoverage.departments.mapped}
                total={health.mappingCoverage.departments.total}
              />
              <CoverageBar
                label="Payment Types"
                mapped={health.mappingCoverage.paymentTypes.mapped}
                total={health.mappingCoverage.paymentTypes.total}
              />
              <CoverageBar
                label="Tax Groups"
                mapped={health.mappingCoverage.taxGroups.mapped}
                total={health.mappingCoverage.taxGroups.total}
              />
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Loading...</p>
          )}
        </div>

        {/* Period Close Status */}
        <div className="rounded-lg border border-border bg-surface p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Current Period</h3>
            <Link
              href="/accounting/close"
              className="text-xs font-medium text-indigo-500 hover:text-indigo-400"
            >
              Close workflow
            </Link>
          </div>
          {health?.currentPeriod ? (
            <div className="mt-3">
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold text-foreground">
                  {health.currentPeriod.postingPeriod}
                </span>
                <StatusBadge status={health.currentPeriod.status} />
              </div>
              {health.currentPeriod.checklist.length > 0 && (
                <div className="mt-3 space-y-1">
                  {health.currentPeriod.checklist.slice(0, 3).map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          item.status === 'pass'
                            ? 'bg-green-500'
                            : item.status === 'fail'
                              ? 'bg-red-500'
                              : 'bg-amber-500'
                        }`}
                      />
                      <span className="text-muted-foreground">{item.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              {isLoading ? 'Loading...' : 'No active period'}
            </p>
          )}
        </div>
      </div>
    </AccountingPageShell>
  );
}

// ── Coverage Bar ──────────────────────────────────────────────

function CoverageBar({
  label,
  mapped,
  total,
}: {
  label: string;
  mapped: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((mapped / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>
          {mapped}/{total} ({pct}%)
        </span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${
            pct === 100 ? 'bg-green-500' : pct > 50 ? 'bg-indigo-500' : 'bg-amber-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
