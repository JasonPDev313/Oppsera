'use client';

import { useState, useMemo } from 'react';
import { Sliders, Download, TrendingUp, AlertTriangle, BarChart3, Layers, Grid3x3 } from 'lucide-react';
import { useAuthContext } from '@/components/auth-provider';
import { useReportFilters } from '@/hooks/use-report-filters';
import { ReportFilterBar } from '@/components/reports/report-filter-bar';
import {
  useModifierPerformance,
  useModifierGroupHealth,
  useModifierUpsellImpact,
  useModifierDaypartHeatmap,
  useModifierGroupItemHeatmap,
  useModifierLocationHeatmap,
  useModifierWasteSignals,
  useModifierComplexity,
  downloadModifierExport,
} from '@/hooks/use-modifier-reports';
import type {
  ModifierPerformanceRow,
  ModifierGroupHealthRow,
  WasteSignalRow,
  ComplexityRow,
  UpsellImpactRow,
} from '@/hooks/use-modifier-reports';
import { HeatmapGrid } from '@/components/reports/heatmap-grid';

// ── Tab types ────────────────────────────────────────────────────

type TabKey = 'dashboard' | 'group-health' | 'item-performance' | 'upsell' | 'adoption' | 'waste' | 'heatmaps';

const TABS: { key: TabKey; label: string; icon: typeof Sliders }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { key: 'group-health', label: 'Group Health', icon: Layers },
  { key: 'item-performance', label: 'Item Performance', icon: Sliders },
  { key: 'upsell', label: 'Upsell & Margin', icon: TrendingUp },
  { key: 'adoption', label: 'Adoption Funnel', icon: BarChart3 },
  { key: 'waste', label: 'Waste Signals', icon: AlertTriangle },
  { key: 'heatmaps', label: 'Heatmaps', icon: Grid3x3 },
];

// ── Helpers ──────────────────────────────────────────────────────

function formatMoney(v: number): string {
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function formatNum(v: number): string {
  return v.toLocaleString();
}

function recommendationColor(rec: string): string {
  switch (rec) {
    case 'keep': return 'bg-emerald-500/15 text-emerald-500';
    case 'optimize': return 'bg-amber-500/15 text-amber-500';
    case 'remove': return 'bg-red-500/15 text-red-500';
    case 'investigate': return 'bg-orange-500/15 text-orange-500';
    case 'review_prompt': return 'bg-purple-500/15 text-purple-500';
    case 'new': return 'bg-blue-500/15 text-blue-500';
    default: return 'bg-gray-500/15 text-foreground';
  }
}

function recommendationLabel(rec: string): string {
  switch (rec) {
    case 'keep': return 'Keep';
    case 'optimize': return 'Optimize';
    case 'remove': return 'Remove';
    case 'investigate': return 'Investigate';
    case 'review_prompt': return 'Review Prompt';
    case 'new': return 'New';
    default: return rec;
  }
}

// ── KPI Card ────────────────────────────────────────────────────

function KpiCard({ label, value, subtext }: { label: string; value: string; subtext?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
      {subtext && <p className="mt-0.5 text-xs text-muted-foreground">{subtext}</p>}
    </div>
  );
}

// ── Heatmap Sub-Tab Selector ────────────────────────────────────

type HeatmapSubTab = 'group-item' | 'daypart' | 'location';

// ── Main Content ─────────────────────────────────────────────────

export default function ModifierReportsContent() {
  const { locations } = useAuthContext();
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [heatmapSub, setHeatmapSub] = useState<HeatmapSubTab>('group-item');
  const filters = useReportFilters();

  // Data hooks
  const perf = useModifierPerformance(filters.dateFrom, filters.dateTo, filters.selectedLocationId);
  const health = useModifierGroupHealth(filters.dateFrom, filters.dateTo, filters.selectedLocationId);
  const upsell = useModifierUpsellImpact(filters.dateFrom, filters.dateTo, filters.selectedLocationId);
  const daypart = useModifierDaypartHeatmap(filters.dateFrom, filters.dateTo, filters.selectedLocationId);
  const groupItem = useModifierGroupItemHeatmap(filters.dateFrom, filters.dateTo, filters.selectedLocationId);
  const locHeatmap = useModifierLocationHeatmap(filters.dateFrom, filters.dateTo);
  const waste = useModifierWasteSignals(filters.dateFrom, filters.dateTo, filters.selectedLocationId);
  const complexity = useModifierComplexity(filters.dateFrom, filters.dateTo, filters.selectedLocationId);

  // Dashboard KPIs
  const kpis = useMemo(() => {
    const perfData = perf.data ?? [];
    const healthData = health.data ?? [];

    const totalRevenue = perfData.reduce((s, r) => s + r.revenueDollars, 0);
    const totalSelected = perfData.reduce((s, r) => s + r.timesSelected, 0);
    const totalVoids = perfData.reduce((s, r) => s + r.voidCount, 0);

    const totalEligible = healthData.reduce((s, r) => s + r.eligibleLineCount, 0);
    const totalWithSelection = healthData.reduce((s, r) => s + r.linesWithSelection, 0);
    const avgAttachRate = totalEligible > 0 ? totalWithSelection / totalEligible : 0;

    const topUpsell = perfData.length > 0
      ? perfData.reduce((best, r) => r.revenueDollars > best.revenueDollars ? r : best)
      : null;

    const wasteRate = totalSelected > 0 ? totalVoids / totalSelected : 0;

    return { totalRevenue, avgAttachRate, topUpsell, wasteRate };
  }, [perf.data, health.data]);

  // Top/bottom modifiers for dashboard
  const top5 = useMemo(() => {
    const sorted = [...(perf.data ?? [])].sort((a, b) => b.timesSelected - a.timesSelected);
    return sorted.slice(0, 5);
  }, [perf.data]);

  const bottom5 = useMemo(() => {
    const sorted = [...(perf.data ?? [])].sort((a, b) => a.timesSelected - b.timesSelected);
    return sorted.slice(0, 5);
  }, [perf.data]);

  // Heatmap data transforms
  const daypartHeatmapData = useMemo(() => {
    const data = daypart.data ?? [];
    const modifiers = [...new Map(data.map(r => [r.modifierId, r.modifierName])).entries()].map(
      ([key, label]) => ({ key, label }),
    );
    const dayparts = ['breakfast', 'lunch', 'afternoon', 'dinner', 'late_night'].map(d => ({
      key: d,
      label: d.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()),
    }));
    const cells = data.map(r => ({
      rowKey: r.modifierId,
      colKey: r.daypart,
      value: r.timesSelected,
    }));
    return { rows: modifiers, columns: dayparts, cells };
  }, [daypart.data]);

  const groupItemHeatmapData = useMemo(() => {
    const data = groupItem.data ?? [];
    const groups = [...new Map(data.map(r => [r.modifierGroupId, r.groupName])).entries()].map(
      ([key, label]) => ({ key, label }),
    );
    const items = [...new Map(data.map(r => [r.catalogItemId, r.itemName])).entries()].map(
      ([key, label]) => ({ key, label }),
    );
    const cells = data.map(r => ({
      rowKey: r.modifierGroupId,
      colKey: r.catalogItemId,
      value: r.attachRate,
    }));
    return { rows: groups, columns: items, cells };
  }, [groupItem.data]);

  const locationHeatmapData = useMemo(() => {
    const data = locHeatmap.data ?? [];
    const locs = [...new Map(data.map(r => [r.locationId, r.locationName])).entries()].map(
      ([key, label]) => ({ key, label }),
    );
    const groups = [...new Map(data.map(r => [r.modifierGroupId, r.groupName])).entries()].map(
      ([key, label]) => ({ key, label }),
    );
    const cells = data.map(r => ({
      rowKey: r.locationId,
      colKey: r.modifierGroupId,
      value: r.attachRate,
    }));
    return { rows: locs, columns: groups, cells };
  }, [locHeatmap.data]);

  const handleExport = (endpoint: string) => {
    downloadModifierExport(endpoint, {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      locationId: filters.selectedLocationId || undefined,
    });
  };

  const isLoading = perf.isLoading || health.isLoading;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Sliders className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-semibold text-foreground">Modifier Reports</h1>
        </div>
      </div>

      {/* Filter bar */}
      <ReportFilterBar
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        preset={filters.preset}
        onDateChange={filters.setDateRange}
        locationId={filters.selectedLocationId ?? ''}
        onLocationChange={filters.setLocationId}
        locations={locations ?? []}
        isLoading={isLoading}
        onRefresh={() => {
          perf.refresh();
          health.refresh();
          upsell.refresh();
          waste.refresh();
          complexity.refresh();
          daypart.refresh();
          groupItem.refresh();
          locHeatmap.refresh();
        }}
        onReset={filters.reset}
      />

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="-mb-px flex gap-4 overflow-x-auto" aria-label="Modifier report tabs">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Total Modifier Revenue" value={formatMoney(kpis.totalRevenue)} />
            <KpiCard label="Avg Attach Rate" value={formatPct(kpis.avgAttachRate)} />
            <KpiCard
              label="Top Upsell Modifier"
              value={kpis.topUpsell?.modifierName ?? '—'}
              subtext={kpis.topUpsell ? formatMoney(kpis.topUpsell.revenueDollars) : undefined}
            />
            <KpiCard label="Waste Rate" value={formatPct(kpis.wasteRate)} />
          </div>

          {/* Top / Bottom 5 */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-surface p-4">
              <h3 className="mb-3 text-sm font-semibold text-foreground">Top 5 — Most Selected</h3>
              <div className="space-y-2">
                {top5.map(r => (
                  <div key={r.modifierId} className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{r.modifierName}</span>
                    <span className="font-medium text-muted-foreground">{formatNum(r.timesSelected)}</span>
                  </div>
                ))}
                {top5.length === 0 && <p className="text-sm text-muted-foreground">No data</p>}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-surface p-4">
              <h3 className="mb-3 text-sm font-semibold text-foreground">Bottom 5 — Least Selected</h3>
              <div className="space-y-2">
                {bottom5.map(r => (
                  <div key={r.modifierId} className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{r.modifierName}</span>
                    <span className="font-medium text-muted-foreground">{formatNum(r.timesSelected)}</span>
                  </div>
                ))}
                {bottom5.length === 0 && <p className="text-sm text-muted-foreground">No data</p>}
              </div>
            </div>
          </div>

          {/* Recommendation badges from group health */}
          {(health.data ?? []).length > 0 && (
            <div className="rounded-lg border border-border bg-surface p-4">
              <h3 className="mb-3 text-sm font-semibold text-foreground">Group Recommendations</h3>
              <div className="flex flex-wrap gap-2">
                {(health.data ?? []).map(g => (
                  <span
                    key={g.modifierGroupId}
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${recommendationColor(g.recommendation)}`}
                  >
                    {g.groupName}: {recommendationLabel(g.recommendation)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'group-health' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Modifier Group Health</h2>
            <button
              onClick={() => handleExport('/api/v1/reports/modifiers/group-health/export')}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-accent"
            >
              <Download className="h-4 w-4" /> Export CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Group</th>
                  <th className="pb-2 pr-4 font-medium">Required</th>
                  <th className="pb-2 pr-4 font-medium text-right">Eligible</th>
                  <th className="pb-2 pr-4 font-medium text-right">Selected</th>
                  <th className="pb-2 pr-4 font-medium text-right">Attach Rate</th>
                  <th className="pb-2 pr-4 font-medium text-right">Revenue</th>
                  <th className="pb-2 pr-4 font-medium text-right">Voids</th>
                  <th className="pb-2 font-medium">Recommendation</th>
                </tr>
              </thead>
              <tbody>
                {(health.data ?? []).map((r: ModifierGroupHealthRow) => (
                  <tr key={r.modifierGroupId} className="border-b border-border">
                    <td className="py-2 pr-4 font-medium text-foreground">{r.groupName}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{r.isRequired ? 'Yes' : 'No'}</td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">{formatNum(r.eligibleLineCount)}</td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">{formatNum(r.linesWithSelection)}</td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-indigo-500"
                            style={{ width: `${Math.min(r.attachRate * 100, 100)}%` }}
                          />
                        </div>
                        <span>{formatPct(r.attachRate)}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">{formatMoney(r.revenueImpactDollars)}</td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">{formatNum(r.voidCount)}</td>
                    <td className="py-2">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${recommendationColor(r.recommendation)}`}>
                        {recommendationLabel(r.recommendation)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(health.data ?? []).length === 0 && !health.isLoading && (
              <p className="py-8 text-center text-sm text-muted-foreground">No modifier group data for this period</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'item-performance' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Modifier × Item Performance</h2>
            <button
              onClick={() => handleExport('/api/v1/reports/modifiers/performance/export')}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-accent"
            >
              <Download className="h-4 w-4" /> Export CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Modifier</th>
                  <th className="pb-2 pr-4 font-medium">Group</th>
                  <th className="pb-2 pr-4 font-medium text-right">Times Selected</th>
                  <th className="pb-2 pr-4 font-medium text-right">Revenue</th>
                  <th className="pb-2 pr-4 font-medium text-right">Extra $</th>
                  <th className="pb-2 pr-4 font-medium text-right">None</th>
                  <th className="pb-2 pr-4 font-medium text-right">Extra</th>
                  <th className="pb-2 pr-4 font-medium text-right">On Side</th>
                  <th className="pb-2 pr-4 font-medium text-right">Default</th>
                  <th className="pb-2 pr-4 font-medium text-right">Voids</th>
                </tr>
              </thead>
              <tbody>
                {(perf.data ?? []).map((r: ModifierPerformanceRow) => (
                  <tr key={`${r.modifierId}-${r.modifierGroupId}`} className="border-b border-border">
                    <td className="py-2 pr-4 font-medium text-foreground">{r.modifierName}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{r.groupName}</td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">{formatNum(r.timesSelected)}</td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">{formatMoney(r.revenueDollars)}</td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">{formatMoney(r.extraRevenueDollars)}</td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">{formatNum(r.instructionNone)}</td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">{formatNum(r.instructionExtra)}</td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">{formatNum(r.instructionOnSide)}</td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">{formatNum(r.instructionDefault)}</td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">{formatNum(r.voidCount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(perf.data ?? []).length === 0 && !perf.isLoading && (
              <p className="py-8 text-center text-sm text-muted-foreground">No modifier performance data for this period</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'upsell' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Upsell & Margin Impact</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Modifier</th>
                  <th className="pb-2 pr-4 font-medium">Group</th>
                  <th className="pb-2 pr-4 font-medium text-right">Selected</th>
                  <th className="pb-2 pr-4 font-medium text-right">Revenue</th>
                  <th className="pb-2 pr-4 font-medium text-right">Cost</th>
                  <th className="pb-2 pr-4 font-medium text-right">Margin</th>
                  <th className="pb-2 pr-4 font-medium text-right">Margin %</th>
                </tr>
              </thead>
              <tbody>
                {(upsell.data ?? []).map((r: UpsellImpactRow) => (
                  <tr key={r.modifierId} className="border-b border-border">
                    <td className="py-2 pr-4 font-medium text-foreground">{r.modifierName}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{r.groupName}</td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">{formatNum(r.timesSelected)}</td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">{formatMoney(r.revenueDollars)}</td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">
                      {r.costDollars != null ? formatMoney(r.costDollars) : '—'}
                    </td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">
                      {r.marginDollars != null ? formatMoney(r.marginDollars) : '—'}
                    </td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">
                      {r.marginPercent != null ? `${r.marginPercent.toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(upsell.data ?? []).length === 0 && !upsell.isLoading && (
              <p className="py-8 text-center text-sm text-muted-foreground">No upsell data for this period</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'adoption' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Adoption Funnel</h2>
          <div className="space-y-3">
            {(health.data ?? []).map((r: ModifierGroupHealthRow) => {
              const eligiblePct = 1;
              const selectedPct = r.attachRate;
              return (
                <div key={r.modifierGroupId} className="rounded-lg border border-border bg-surface p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-medium text-foreground">{r.groupName}</span>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${recommendationColor(r.recommendation)}`}>
                      {recommendationLabel(r.recommendation)}
                    </span>
                  </div>
                  {/* Eligible bar */}
                  <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="w-20">Eligible</span>
                    <div className="flex-1">
                      <div className="h-5 rounded bg-muted">
                        <div
                          className="flex h-full items-center rounded bg-gray-400 px-2 text-xs text-white"
                          style={{ width: `${eligiblePct * 100}%` }}
                        >
                          {formatNum(r.eligibleLineCount)}
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Selected bar */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="w-20">Selected</span>
                    <div className="flex-1">
                      <div className="h-5 rounded bg-muted">
                        <div
                          className="flex h-full items-center rounded bg-indigo-500 px-2 text-xs text-white"
                          style={{ width: `${Math.max(selectedPct * 100, 2)}%` }}
                        >
                          {formatNum(r.linesWithSelection)} ({formatPct(r.attachRate)})
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {(health.data ?? []).length === 0 && !health.isLoading && (
              <p className="py-8 text-center text-sm text-muted-foreground">No adoption data for this period</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'waste' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Waste & Void Signals</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Modifier</th>
                  <th className="pb-2 pr-4 font-medium">Group</th>
                  <th className="pb-2 pr-4 font-medium text-right">Selected</th>
                  <th className="pb-2 pr-4 font-medium text-right">Void Count</th>
                  <th className="pb-2 pr-4 font-medium text-right">Void Rate</th>
                  <th className="pb-2 pr-4 font-medium text-right">Void Revenue</th>
                </tr>
              </thead>
              <tbody>
                {(waste.data ?? []).map((r: WasteSignalRow) => (
                  <tr key={r.modifierId} className="border-b border-border">
                    <td className="py-2 pr-4 font-medium text-foreground">{r.modifierName}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{r.groupName}</td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">{formatNum(r.timesSelected)}</td>
                    <td className="py-2 pr-4 text-right text-red-500 font-medium">{formatNum(r.voidCount)}</td>
                    <td className="py-2 pr-4 text-right text-red-500">{formatPct(r.voidRate)}</td>
                    <td className="py-2 pr-4 text-right text-red-500">{formatMoney(r.voidRevenueDollars)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(waste.data ?? []).length === 0 && !waste.isLoading && (
              <p className="py-8 text-center text-sm text-muted-foreground">No waste signals — great!</p>
            )}
          </div>

          {/* Complexity table below waste */}
          <h2 className="text-lg font-semibold text-foreground">Operational Complexity</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Item</th>
                  <th className="pb-2 pr-4 font-medium text-right">Modifiers</th>
                  <th className="pb-2 pr-4 font-medium text-right">Groups</th>
                  <th className="pb-2 pr-4 font-medium text-right">Total Selections</th>
                  <th className="pb-2 pr-4 font-medium text-right">Avg/Order</th>
                  <th className="pb-2 pr-4 font-medium text-right">Complexity Score</th>
                </tr>
              </thead>
              <tbody>
                {(complexity.data ?? []).map((r: ComplexityRow) => (
                  <tr key={r.catalogItemId} className="border-b border-border">
                    <td className="py-2 pr-4 font-medium text-foreground">{r.catalogItemName}</td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">{formatNum(r.distinctModifiers)}</td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">{formatNum(r.distinctGroups)}</td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">{formatNum(r.totalSelections)}</td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">{r.avgModifiersPerOrder.toFixed(1)}</td>
                    <td className="py-2 pr-4 text-right font-medium text-foreground">{r.complexityScore.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(complexity.data ?? []).length === 0 && !complexity.isLoading && (
              <p className="py-8 text-center text-sm text-muted-foreground">No complexity data for this period</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'heatmaps' && (
        <div className="space-y-4">
          {/* Sub-tab selector */}
          <div className="flex gap-2">
            {([
              { key: 'group-item' as HeatmapSubTab, label: 'Group × Item' },
              { key: 'daypart' as HeatmapSubTab, label: 'Modifier × Daypart' },
              { key: 'location' as HeatmapSubTab, label: 'Location × Group' },
            ]).map(st => (
              <button
                key={st.key}
                onClick={() => setHeatmapSub(st.key)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  heatmapSub === st.key
                    ? 'bg-indigo-600 text-white'
                    : 'bg-muted text-foreground hover:bg-accent'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          {heatmapSub === 'group-item' && (
            <HeatmapGrid
              title="Modifier Group × Item — Attach Rate"
              rows={groupItemHeatmapData.rows}
              columns={groupItemHeatmapData.columns}
              cells={groupItemHeatmapData.cells}
              formatValue={formatPct}
              colorScale="green"
              showValues
            />
          )}

          {heatmapSub === 'daypart' && (
            <HeatmapGrid
              title="Modifier × Daypart — Times Selected"
              rows={daypartHeatmapData.rows}
              columns={daypartHeatmapData.columns}
              cells={daypartHeatmapData.cells}
              formatValue={formatNum}
              colorScale="blue"
              showValues
            />
          )}

          {heatmapSub === 'location' && (
            <HeatmapGrid
              title="Location × Group — Attach Rate"
              rows={locationHeatmapData.rows}
              columns={locationHeatmapData.columns}
              cells={locationHeatmapData.cells}
              formatValue={formatPct}
              colorScale="green"
              showValues
            />
          )}
        </div>
      )}
    </div>
  );
}
