'use client';

import { useState, useCallback, memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthContext } from '@/components/auth-provider';
import { apiFetch } from '@/lib/api-client';
import {
  ArrowLeft,
  TrendingUp,
  Users,
  UtensilsCrossed,
  DollarSign,
  AlertTriangle,
  Clock,
  ChefHat,
  Percent,
  Ban,
  Trophy,
  Sun,
  Sunrise,
  Moon,
  CloudMoon,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  WifiOff,
} from 'lucide-react';
import { formatDollarsLocale } from '@oppsera/shared';
import { useRouter } from 'next/navigation';
import {
  computeDateRange,
  detectPreset,
  shiftDateRange,
  DATE_PRESET_OPTIONS,
} from '@/lib/date-presets';
import type { DatePreset } from '@/lib/date-presets';

// ── Types (matches FnbDashboardMetrics from backend) ────────────

interface DashboardMetrics {
  totalCovers: number;
  totalSales: number;
  avgCheck: number;
  tablesTurned: number;
  avgTurnTimeMinutes: number | null;
  tipTotal: number;
  tipPercentage: number | null;
  kitchenAvgTicketTimeSeconds: number | null;
  ticketsPastThreshold: number;
  voidCount: number;
  totalComps: number;
  totalDiscounts: number;
  topServer: { serverUserId: string; totalSales: number; serverName?: string } | null;
  daypartBreakdown: Array<{
    daypart: string;
    covers: number;
    grossSales: number;
  }>;
  hourlySales: Array<{
    hour: number;
    salesCents: number;
    covers: number;
  }>;
}

// ── Helpers ──────────────────────────────────────────────────────

const DAYPART_META: Record<string, { label: string; icon: typeof Sun; color: string }> = {
  breakfast: { label: 'Breakfast', icon: Sunrise, color: 'var(--fnb-status-available)' },
  lunch: { label: 'Lunch', icon: Sun, color: 'var(--fnb-status-seated)' },
  dinner: { label: 'Dinner', icon: Moon, color: 'var(--fnb-status-ordered)' },
  late_night: { label: 'Late Night', icon: CloudMoon, color: 'var(--fnb-status-dessert)' },
};

function formatHour(hour: number): string {
  if (hour === 0) return '12a';
  if (hour < 12) return `${hour}a`;
  if (hour === 12) return '12p';
  return `${hour - 12}p`;
}

function formatMinutes(mins: number | null): string {
  if (mins == null) return '—';
  return `${mins}m`;
}

function formatSeconds(secs: number | null): string {
  if (secs == null) return '—';
  if (secs >= 60) return `${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s`;
  return `${Math.round(secs)}s`;
}

/** Build API URL from date range params — pure function, no closure issues */
function buildDashboardUrl(locationId: string, from: string, to: string): string {
  const base = `/api/v1/fnb/reports/dashboard?locationId=${encodeURIComponent(locationId)}&businessDate=${from}`;
  return from === to ? base : `${base}&endDate=${to}`;
}

// ── Filter Bar (POS-themed) ─────────────────────────────────────

const FNB_PRESETS: DatePreset[] = [
  'today', 'yesterday', 'last_7_days', 'last_30_days',
  'week_to_date', 'month_to_date',
];

const PRESET_OPTIONS = DATE_PRESET_OPTIONS.filter((o) => FNB_PRESETS.includes(o.value));

const ManagerFilterBar = memo(function ManagerFilterBar({
  dateFrom,
  dateTo,
  preset,
  onDateChange,
  isLoading,
  onRefresh,
}: {
  dateFrom: string;
  dateTo: string;
  preset: DatePreset;
  onDateChange: (from: string, to: string, preset: DatePreset) => void;
  isLoading: boolean;
  onRefresh: () => void;
}) {
  const handlePresetChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newPreset = e.target.value as DatePreset;
      if (newPreset === 'custom') return;
      const range = computeDateRange(newPreset);
      onDateChange(range.from, range.to, newPreset);
    },
    [onDateChange],
  );

  const handleShiftBack = useCallback(() => {
    const shifted = shiftDateRange(dateFrom, dateTo, preset, 'back');
    const detected = detectPreset(shifted.from, shifted.to);
    onDateChange(shifted.from, shifted.to, detected);
  }, [dateFrom, dateTo, preset, onDateChange]);

  const handleShiftForward = useCallback(() => {
    const shifted = shiftDateRange(dateFrom, dateTo, preset, 'forward');
    const detected = detectPreset(shifted.from, shifted.to);
    onDateChange(shifted.from, shifted.to, detected);
  }, [dateFrom, dateTo, preset, onDateChange]);

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-xl border px-4 py-3"
      style={{ borderColor: 'rgba(148, 163, 184, 0.15)', backgroundColor: 'var(--fnb-bg-surface)' }}
    >
      {/* Preset dropdown */}
      <select
        value={preset}
        onChange={handlePresetChange}
        className="rounded-lg border px-3 py-1.5 text-xs font-medium focus:outline-none"
        style={{
          borderColor: 'rgba(148, 163, 184, 0.25)',
          backgroundColor: 'var(--fnb-bg-elevated)',
          color: 'var(--fnb-text-primary)',
        }}
        aria-label="Date range preset"
      >
        {PRESET_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* Shift back */}
      <button
        type="button"
        onClick={handleShiftBack}
        className="rounded-lg p-1.5 transition-colors hover:opacity-80"
        style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-secondary)' }}
        aria-label="Previous period"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>

      {/* Date display */}
      <span className="text-xs font-medium" style={{ color: 'var(--fnb-text-primary)' }}>
        {dateFrom === dateTo ? dateFrom : `${dateFrom} – ${dateTo}`}
      </span>

      {/* Shift forward */}
      <button
        type="button"
        onClick={handleShiftForward}
        className="rounded-lg p-1.5 transition-colors hover:opacity-80"
        style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-secondary)' }}
        aria-label="Next period"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Refresh */}
      <button
        type="button"
        onClick={onRefresh}
        className="rounded-lg p-1.5 transition-colors hover:opacity-80"
        style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-secondary)' }}
        aria-label="Refresh"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
});

// ── KPI Skeleton ────────────────────────────────────────────────

function KpiSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border p-4"
            style={{ borderColor: 'rgba(148, 163, 184, 0.15)', backgroundColor: 'var(--fnb-bg-surface)' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="h-4 w-4 rounded animate-pulse" style={{ backgroundColor: 'var(--fnb-bg-elevated)' }} />
              <div className="h-3 w-16 rounded animate-pulse" style={{ backgroundColor: 'var(--fnb-bg-elevated)' }} />
            </div>
            <div className="h-6 w-20 rounded animate-pulse" style={{ backgroundColor: 'var(--fnb-bg-elevated)' }} />
          </div>
        ))}
      </div>
      <div className="rounded-xl border p-4" style={{ borderColor: 'rgba(148, 163, 184, 0.15)', backgroundColor: 'var(--fnb-bg-surface)' }}>
        <div className="h-4 w-32 rounded animate-pulse mb-4" style={{ backgroundColor: 'var(--fnb-bg-elevated)' }} />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 rounded animate-pulse" style={{ backgroundColor: 'var(--fnb-bg-elevated)' }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Empty State ─────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <UtensilsCrossed className="h-12 w-12 mb-4" style={{ color: 'var(--fnb-text-muted)', opacity: 0.5 }} />
      <h2 className="text-base font-bold mb-1" style={{ color: 'var(--fnb-text-primary)' }}>No Data Yet</h2>
      <p className="text-xs text-center max-w-xs" style={{ color: 'var(--fnb-text-muted)' }}>
        No sales have been recorded for this period. Data will appear here as tabs are closed.
      </p>
    </div>
  );
}

// ── Error State ─────────────────────────────────────────────────

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <WifiOff className="h-12 w-12 mb-4" style={{ color: 'var(--fnb-text-muted)', opacity: 0.5 }} />
      <h2 className="text-base font-bold mb-1" style={{ color: 'var(--fnb-text-primary)' }}>Failed to Load</h2>
      <p className="text-xs text-center max-w-xs mb-4" style={{ color: 'var(--fnb-text-muted)' }}>
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg px-4 py-2 text-xs font-medium transition-colors hover:opacity-80"
        style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-primary)' }}
      >
        Retry
      </button>
    </div>
  );
}

// ── KPI Card ────────────────────────────────────────────────────

const KpiCard = memo(function KpiCard({ label, value, icon: Icon, color }: {
  label: string;
  value: string;
  icon: typeof DollarSign;
  color: string;
}) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: 'rgba(148, 163, 184, 0.15)', backgroundColor: 'var(--fnb-bg-surface)' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4" style={{ color }} />
        <span className="text-[10px] font-bold uppercase" style={{ color: 'var(--fnb-text-muted)' }}>{label}</span>
      </div>
      <span
        className="text-xl font-bold"
        style={{ color: 'var(--fnb-text-primary)', fontFamily: 'var(--fnb-font-mono)' }}
      >
        {value}
      </span>
    </div>
  );
});

// ── Hourly Sales Bar Chart ──────────────────────────────────────

const HourlySalesChart = memo(function HourlySalesChart({ data }: { data: DashboardMetrics['hourlySales'] }) {
  if (data.length === 0) return null;

  const maxSales = Math.max(...data.map((h) => h.salesCents), 1);

  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: 'rgba(148, 163, 184, 0.15)', backgroundColor: 'var(--fnb-bg-surface)' }}
    >
      <h3 className="text-xs font-bold uppercase mb-4" style={{ color: 'var(--fnb-text-muted)' }}>
        Hourly Sales
      </h3>
      <div className="flex items-end gap-1" style={{ height: 120 }}>
        {data.map((h) => {
          const pct = (h.salesCents / maxSales) * 100;
          return (
            <div key={h.hour} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full rounded-t transition-all"
                style={{
                  height: `${Math.max(pct, 2)}%`,
                  backgroundColor: 'var(--fnb-status-seated)',
                  opacity: pct > 0 ? 1 : 0.2,
                  minHeight: 2,
                }}
              />
              <span className="text-[8px]" style={{ color: 'var(--fnb-text-muted)' }}>
                {formatHour(h.hour)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
});

// ── Daypart Breakdown ───────────────────────────────────────────

const DaypartBreakdown = memo(function DaypartBreakdown({ data }: { data: DashboardMetrics['daypartBreakdown'] }) {
  if (data.length === 0) return null;

  const totalSales = data.reduce((sum: number, d) => sum + d.grossSales, 0);

  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: 'rgba(148, 163, 184, 0.15)', backgroundColor: 'var(--fnb-bg-surface)' }}
    >
      <h3 className="text-xs font-bold uppercase mb-4" style={{ color: 'var(--fnb-text-muted)' }}>
        Daypart Breakdown
      </h3>
      <div className="space-y-3">
        {data.map((dp) => {
          const meta = DAYPART_META[dp.daypart] ?? { label: dp.daypart, icon: Sun, color: 'var(--fnb-text-muted)' };
          const Icon = meta.icon;
          const pct = totalSales > 0 ? (dp.grossSales / totalSales) * 100 : 0;
          return (
            <div key={dp.daypart}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5" style={{ color: meta.color }} />
                  <span className="text-xs font-medium" style={{ color: 'var(--fnb-text-primary)' }}>{meta.label}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px]" style={{ color: 'var(--fnb-text-muted)' }}>{dp.covers} covers</span>
                  <span className="text-xs font-bold" style={{ color: 'var(--fnb-text-primary)', fontFamily: 'var(--fnb-font-mono)' }}>
                    {formatDollarsLocale(dp.grossSales)}
                  </span>
                </div>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: meta.color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

// ── Top Server Banner ───────────────────────────────────────────

const TopServerBanner = memo(function TopServerBanner({ topServer }: { topServer: DashboardMetrics['topServer'] }) {
  if (!topServer) return null;
  return (
    <div
      className="flex items-center gap-3 rounded-xl border px-4 py-3"
      style={{
        borderColor: 'rgba(234, 179, 8, 0.3)',
        backgroundColor: 'rgba(234, 179, 8, 0.08)',
      }}
    >
      <Trophy className="h-4 w-4 shrink-0" style={{ color: 'rgb(234, 179, 8)' }} />
      <div className="flex-1 min-w-0">
        <span className="text-[10px] font-bold uppercase" style={{ color: 'var(--fnb-text-muted)' }}>Top Server</span>
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-bold truncate" style={{ color: 'var(--fnb-text-primary)' }}>
            {/* TODO: resolve serverUserId to display name via user lookup endpoint */}
            {topServer.serverName ?? `Server ${topServer.serverUserId.slice(0, 8)}…`}
          </span>
          <span className="text-xs font-bold" style={{ color: 'rgb(234, 179, 8)', fontFamily: 'var(--fnb-font-mono)' }}>
            {formatDollarsLocale(topServer.totalSales)}
          </span>
        </div>
      </div>
    </div>
  );
});

// ── Main Component ──────────────────────────────────────────────

export default function ManagerContent() {
  const { locations } = useAuthContext();
  const router = useRouter();
  const locationId = locations[0]?.id ?? '';

  // Date filter state — defaults to 'today'
  const [preset, setPreset] = useState<DatePreset>('today');
  const [dateRange, setDateRange] = useState(() => computeDateRange('today'));

  const handleDateChange = useCallback((from: string, to: string, newPreset: DatePreset) => {
    setDateRange({ from, to });
    setPreset(newPreset);
  }, []);

  // §62: React Query with signal forwarding and staleTime
  // URL built inside queryFn to avoid stale closure capture
  const { data: metrics, isLoading, isFetching, error, refetch } = useQuery<
    DashboardMetrics,
    Error,
    DashboardMetrics,
    readonly [string, string, string, string, string]
  >({
    queryKey: ['fnb', 'manager-dashboard', locationId, dateRange.from, dateRange.to] as const,
    queryFn: ({ signal }) => {
      const url = buildDashboardUrl(locationId, dateRange.from, dateRange.to);
      return apiFetch<{ data: DashboardMetrics }>(url, { signal }).then((r) => r.data);
    },
    enabled: !!locationId,
    staleTime: 60_000,
    // Keep previous data visible while loading new date range — avoids flash
    placeholderData: (prev) => prev,
    // POS tablets trigger focus events frequently — don't refetch on every focus
    refetchOnWindowFocus: false,
  });

  const handleRefresh = useCallback(() => { refetch(); }, [refetch]);

  const isEmpty = metrics && metrics.totalCovers === 0 && metrics.totalSales === 0;

  // Show skeleton only on first load (no previous data), not on filter changes
  const showSkeleton = isLoading && !metrics;

  const kpiCards = metrics
    ? [
        { label: 'Net Sales', value: formatDollarsLocale(metrics.totalSales), icon: DollarSign, color: 'var(--fnb-status-available)' },
        { label: 'Covers', value: String(metrics.totalCovers), icon: Users, color: 'var(--fnb-status-seated)' },
        { label: 'Avg Check', value: formatDollarsLocale(metrics.avgCheck), icon: TrendingUp, color: 'var(--fnb-status-ordered)' },
        { label: 'Tables Turned', value: String(metrics.tablesTurned), icon: UtensilsCrossed, color: 'var(--fnb-status-entrees-fired)' },
        { label: 'Avg Turn Time', value: formatMinutes(metrics.avgTurnTimeMinutes), icon: Clock, color: 'var(--fnb-status-check-dropped)' },
        { label: 'Tips', value: formatDollarsLocale(metrics.tipTotal), icon: DollarSign, color: 'var(--fnb-status-dessert)' },
        { label: 'Tip %', value: metrics.tipPercentage != null ? `${metrics.tipPercentage}%` : '—', icon: Percent, color: 'var(--fnb-status-dessert)' },
        { label: 'Kitchen Avg Ticket', value: formatSeconds(metrics.kitchenAvgTicketTimeSeconds), icon: ChefHat, color: 'var(--fnb-status-entrees-fired)' },
        { label: 'Voids + Comps', value: formatDollarsLocale(metrics.totalComps + metrics.totalDiscounts), icon: AlertTriangle, color: 'var(--fnb-status-dirty)' },
      ]
    : [];

  const showKitchenAlert = metrics && metrics.ticketsPastThreshold > 0;

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col" style={{ backgroundColor: 'var(--fnb-bg-primary)' }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-6 py-4 border-b shrink-0"
        style={{ backgroundColor: 'var(--fnb-bg-surface)', borderColor: 'rgba(148, 163, 184, 0.15)' }}
      >
        <button
          type="button"
          onClick={() => router.push('/pos/fnb')}
          className="flex items-center justify-center rounded-lg h-8 w-8 transition-colors hover:opacity-80"
          style={{ backgroundColor: 'var(--fnb-bg-elevated)', color: 'var(--fnb-text-secondary)' }}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-lg font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
          Manager Dashboard
        </h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-6">
          {/* §175: ReportFilterBar — date preset dropdown, shift controls */}
          <ManagerFilterBar
            dateFrom={dateRange.from}
            dateTo={dateRange.to}
            preset={preset}
            onDateChange={handleDateChange}
            isLoading={isFetching}
            onRefresh={handleRefresh}
          />

          {/* Loading bar — subtle indicator during background refetch */}
          {isFetching && metrics && (
            <div className="h-0.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}>
              <div className="h-full w-full animate-pulse" style={{ backgroundColor: 'var(--fnb-status-seated)' }} />
            </div>
          )}

          {showSkeleton ? (
            <KpiSkeleton />
          ) : error ? (
            <ErrorState
              message={error instanceof Error ? error.message : 'Could not load dashboard metrics'}
              onRetry={() => refetch()}
            />
          ) : isEmpty ? (
            <EmptyState />
          ) : metrics ? (
            <>
              {/* Kitchen Alert Banner */}
              {showKitchenAlert && (
                <div
                  className="flex items-center gap-3 rounded-xl border px-4 py-3"
                  style={{
                    borderColor: 'rgba(239, 68, 68, 0.3)',
                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  }}
                >
                  <Ban className="h-4 w-4 shrink-0" style={{ color: 'rgb(239, 68, 68)' }} />
                  <span className="text-xs font-medium" style={{ color: 'rgb(239, 68, 68)' }}>
                    {metrics.ticketsPastThreshold} ticket{metrics.ticketsPastThreshold !== 1 ? 's' : ''} past threshold
                  </span>
                </div>
              )}

              {/* Top Server */}
              <TopServerBanner topServer={metrics.topServer} />

              {/* KPI Cards — 3-col grid */}
              <div className="grid grid-cols-3 gap-3">
                {kpiCards.map(({ label, value, icon, color }) => (
                  <KpiCard key={label} label={label} value={value} icon={icon} color={color} />
                ))}
              </div>

              {/* Daypart Breakdown */}
              <DaypartBreakdown data={metrics.daypartBreakdown} />

              {/* Hourly Sales Chart */}
              <HourlySalesChart data={metrics.hourlySales} />

              {/* Quick Actions */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => router.push('/close-batch')}
                  className="rounded-xl border p-4 text-left transition-colors hover:opacity-80"
                  style={{ borderColor: 'rgba(148, 163, 184, 0.15)', backgroundColor: 'var(--fnb-bg-surface)' }}
                >
                  <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--fnb-text-primary)' }}>Close Batch</h3>
                  <p className="text-[10px]" style={{ color: 'var(--fnb-text-muted)' }}>End of day close, Z-report, cash count</p>
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/host')}
                  className="rounded-xl border p-4 text-left transition-colors hover:opacity-80"
                  style={{ borderColor: 'rgba(148, 163, 184, 0.15)', backgroundColor: 'var(--fnb-bg-surface)' }}
                >
                  <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--fnb-text-primary)' }}>Host Stand</h3>
                  <p className="text-[10px]" style={{ color: 'var(--fnb-text-muted)' }}>Server rotation, cover balance, seating</p>
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
