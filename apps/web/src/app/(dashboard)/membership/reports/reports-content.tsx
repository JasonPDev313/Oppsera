'use client';

import { useState, useMemo } from 'react';
import {
  Target,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Download,
  Filter,
  RefreshCw,
  AlertCircle,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useMinimumCompliance } from '@/hooks/use-membership';
import type { MinimumComplianceEntry } from '@/types/membership';

// ── Helpers ─────────────────────────────────────────────────────

function formatMoney(cents: number): string {
  const abs = Math.abs(cents);
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(abs / 100);
  if (cents < 0) return `(${formatted})`;
  return formatted;
}

function formatDate(iso: string | null): string {
  if (!iso) return '--';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function trafficLightBadge(light: 'green' | 'amber' | 'red') {
  switch (light) {
    case 'green':
      return <Badge variant="success"><CheckCircle className="mr-1 h-3 w-3" />Met</Badge>;
    case 'amber':
      return <Badge variant="warning"><AlertTriangle className="mr-1 h-3 w-3" />At Risk</Badge>;
    case 'red':
      return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />Below</Badge>;
  }
}

function getDefaultPeriod() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
  };
}

// ── KPI Card ────────────────────────────────────────────────────

function KpiCard({
  title,
  value,
  icon: Icon,
  color,
  subtitle,
}: {
  title: string;
  value: string | number;
  icon: typeof Target;
  color: string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</div>
          <div className="text-xl font-bold text-foreground">{value}</div>
          {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
        </div>
      </div>
    </div>
  );
}

// ── Compliance Table Row ────────────────────────────────────────

function ComplianceRow({ entry }: { entry: MinimumComplianceEntry }) {
  const progressColor =
    entry.progressPercent >= 100
      ? 'text-green-500'
      : entry.progressPercent >= 50
        ? 'text-amber-500'
        : 'text-red-500';

  const barColor =
    entry.progressPercent >= 100
      ? 'bg-green-500'
      : entry.progressPercent >= 50
        ? 'bg-amber-500'
        : 'bg-red-500';

  const barBg =
    entry.progressPercent >= 100
      ? 'bg-green-500/10'
      : entry.progressPercent >= 50
        ? 'bg-amber-500/10'
        : 'bg-red-500/10';

  return (
    <tr className="border-b border-gray-50 hover:bg-accent/50">
      <td className="py-3 pr-4 text-sm text-foreground">
        {entry.customerId.slice(0, 12)}...
      </td>
      <td className="py-3 pr-4 text-sm text-muted-foreground">
        {formatDate(entry.periodStart)} - {formatDate(entry.periodEnd)}
      </td>
      <td className="py-3 pr-4 text-right text-sm font-medium text-foreground">
        {formatMoney(entry.requiredCents)}
      </td>
      <td className="py-3 pr-4 text-right text-sm text-foreground">
        {formatMoney(entry.satisfiedCents)}
      </td>
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2">
          <div className={`h-2 w-20 overflow-hidden rounded-full ${barBg}`}>
            <div
              className={`h-full rounded-full ${barColor}`}
              style={{ width: `${Math.min(entry.progressPercent, 100)}%` }}
            />
          </div>
          <span className={`text-xs font-semibold ${progressColor}`}>
            {entry.progressPercent}%
          </span>
        </div>
      </td>
      <td className="py-3 pr-4 text-right text-sm">
        {entry.shortfallCents > 0 ? (
          <span className="text-red-500">{formatMoney(entry.shortfallCents)}</span>
        ) : (
          <span className="text-green-500">$0.00</span>
        )}
      </td>
      <td className="py-3">
        {trafficLightBadge(entry.trafficLight)}
      </td>
    </tr>
  );
}

// ── Export CSV ───────────────────────────────────────────────────

function exportCsv(entries: MinimumComplianceEntry[]) {
  const BOM = '\uFEFF';
  const header = ['Customer ID', 'Period Start', 'Period End', 'Required', 'Spent', 'Progress %', 'Shortfall', 'Status'];
  const rows = entries.map((e) => [
    e.customerId,
    e.periodStart,
    e.periodEnd,
    (e.requiredCents / 100).toFixed(2),
    (e.satisfiedCents / 100).toFixed(2),
    String(e.progressPercent),
    (e.shortfallCents / 100).toFixed(2),
    e.trafficLight,
  ]);

  const csv = BOM + [header, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `minimum-compliance-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Main Content ────────────────────────────────────────────────

export default function ReportsContent() {
  const defaults = useMemo(() => getDefaultPeriod(), []);
  const [periodStart, setPeriodStart] = useState(defaults.periodStart);
  const [periodEnd, setPeriodEnd] = useState(defaults.periodEnd);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [trafficFilter, setTrafficFilter] = useState<'all' | 'green' | 'amber' | 'red'>('all');

  const { dashboard, isLoading, error, mutate } = useMinimumCompliance({
    periodStart,
    periodEnd,
    status: statusFilter || undefined,
  });

  const filteredEntries = useMemo(() => {
    if (!dashboard) return [];
    if (trafficFilter === 'all') return dashboard.entries;
    return dashboard.entries.filter((e) => e.trafficLight === trafficFilter);
  }, [dashboard, trafficFilter]);

  // Loading
  if (isLoading && !dashboard) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-center gap-3 p-12 text-muted-foreground">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <p className="text-sm font-medium">Failed to load compliance data</p>
        <p className="text-xs text-muted-foreground">{error.message}</p>
        <button
          type="button"
          onClick={mutate}
          className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-500"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Minimum Spend Compliance</h1>
          <p className="text-sm text-muted-foreground">
            Track member progress toward minimum spending requirements
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={mutate}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
          {dashboard && dashboard.entries.length > 0 && (
            <button
              type="button"
              onClick={() => exportCsv(filteredEntries)}
              className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Filters</span>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground">Period Start</label>
          <input
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground"
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground">Period End</label>
          <input
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground"
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground"
          >
            <option value="">All</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="charged">Charged</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground">Compliance</label>
          <select
            value={trafficFilter}
            onChange={(e) => setTrafficFilter(e.target.value as 'all' | 'green' | 'amber' | 'red')}
            className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground"
          >
            <option value="all">All</option>
            <option value="green">Met (100%+)</option>
            <option value="amber">At Risk (50-99%)</option>
            <option value="red">Below (0-49%)</option>
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      {dashboard && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Total Members"
            value={dashboard.totalMembers}
            icon={Users}
            color="bg-indigo-600"
          />
          <KpiCard
            title="Met Minimum"
            value={dashboard.metMinimum}
            icon={CheckCircle}
            color="bg-green-600"
            subtitle={
              dashboard.totalMembers > 0
                ? `${Math.round((dashboard.metMinimum / dashboard.totalMembers) * 100)}%`
                : undefined
            }
          />
          <KpiCard
            title="At Risk"
            value={dashboard.atRisk}
            icon={AlertTriangle}
            color="bg-amber-500"
            subtitle={
              dashboard.totalMembers > 0
                ? `${Math.round((dashboard.atRisk / dashboard.totalMembers) * 100)}%`
                : undefined
            }
          />
          <KpiCard
            title="Below Minimum"
            value={dashboard.belowMinimum}
            icon={XCircle}
            color="bg-red-600"
            subtitle={
              dashboard.totalMembers > 0
                ? `${Math.round((dashboard.belowMinimum / dashboard.totalMembers) * 100)}%`
                : undefined
            }
          />
        </div>
      )}

      {/* Aggregate totals */}
      {dashboard && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-surface p-4 text-center">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Total Required
            </div>
            <div className="mt-1 text-lg font-bold text-foreground">
              {formatMoney(dashboard.totalRequiredCents)}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4 text-center">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Total Satisfied
            </div>
            <div className="mt-1 text-lg font-bold text-foreground">
              {formatMoney(dashboard.totalSatisfiedCents)}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4 text-center">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Total Shortfall
            </div>
            <div className={`mt-1 text-lg font-bold ${dashboard.totalShortfallCents > 0 ? 'text-red-500' : 'text-green-500'}`}>
              {formatMoney(dashboard.totalShortfallCents)}
            </div>
          </div>
        </div>
      )}

      {/* Compliance Table */}
      {dashboard && (
        <div className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">
              Member Compliance Detail ({filteredEntries.length})
            </h2>
          </div>

          {filteredEntries.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
              <Target className="h-6 w-6" />
              <p className="text-sm">No compliance records found for the selected filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Customer</th>
                    <th className="px-4 py-3 font-medium">Period</th>
                    <th className="px-4 py-3 text-right font-medium">Required</th>
                    <th className="px-4 py-3 text-right font-medium">Spent</th>
                    <th className="px-4 py-3 font-medium">Progress</th>
                    <th className="px-4 py-3 text-right font-medium">Shortfall</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map((entry, idx) => (
                    <ComplianceRow key={`${entry.customerId}-${entry.ruleId}-${idx}`} entry={entry} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
