'use client';

import { useState, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Clock,
  Users,
  UserX,
  RotateCcw,
  ArrowRight,
  ChevronDown,
} from 'lucide-react';
import { useHostAnalytics } from '@/hooks/use-host-analytics';
import type { HostAnalyticsResult } from '@/hooks/use-host-analytics';

// ── Quick date range helpers ────────────────────────────────────

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getQuickRange(key: string): { start: string; end: string } {
  const today = new Date();
  const end = formatDate(today);
  switch (key) {
    case 'today':
      return { start: end, end };
    case 'yesterday': {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { start: formatDate(y), end: formatDate(y) };
    }
    case '7d': {
      const s = new Date(today);
      s.setDate(s.getDate() - 6);
      return { start: formatDate(s), end };
    }
    case '30d': {
      const s = new Date(today);
      s.setDate(s.getDate() - 29);
      return { start: formatDate(s), end };
    }
    default:
      return { start: end, end };
  }
}

const QUICK_RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: 'Last 7 Days' },
  { key: '30d', label: 'Last 30 Days' },
] as const;

const MEAL_OPTIONS = [
  { value: '', label: 'All Periods' },
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'brunch', label: 'Brunch' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
] as const;

// ── Main Component ──────────────────────────────────────────────

interface HostAnalyticsDashboardProps {
  locationId: string;
}

export function HostAnalyticsDashboard({ locationId }: HostAnalyticsDashboardProps) {
  const [rangeKey, setRangeKey] = useState('7d');
  const [mealPeriod, setMealPeriod] = useState('');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const { start, end } = useMemo(() => {
    if (rangeKey === 'custom' && customStart && customEnd) {
      return { start: customStart, end: customEnd };
    }
    return getQuickRange(rangeKey);
  }, [rangeKey, customStart, customEnd]);

  const { data, isLoading, error } = useHostAnalytics(
    locationId,
    start,
    end,
    mealPeriod || undefined,
  );

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto">
      {/* Filters Row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 rounded-lg p-0.5" style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}>
          {QUICK_RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRangeKey(r.key)}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
              style={{
                backgroundColor: rangeKey === r.key ? 'var(--fnb-info)' : 'transparent',
                color: rangeKey === r.key ? '#fff' : 'var(--fnb-text-secondary)',
              }}
            >
              {r.label}
            </button>
          ))}
          <button
            onClick={() => setRangeKey('custom')}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
            style={{
              backgroundColor: rangeKey === 'custom' ? 'var(--fnb-info)' : 'transparent',
              color: rangeKey === 'custom' ? '#fff' : 'var(--fnb-text-secondary)',
            }}
          >
            Custom
          </button>
        </div>

        {rangeKey === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="rounded-md px-2 py-1.5 text-xs"
              style={{
                backgroundColor: 'var(--fnb-bg-elevated)',
                color: 'var(--fnb-text-primary)',
                border: 'var(--fnb-border-subtle)',
              }}
            />
            <span className="text-xs" style={{ color: 'var(--fnb-text-muted)' }}>to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="rounded-md px-2 py-1.5 text-xs"
              style={{
                backgroundColor: 'var(--fnb-bg-elevated)',
                color: 'var(--fnb-text-primary)',
                border: 'var(--fnb-border-subtle)',
              }}
            />
          </div>
        )}

        <div className="relative">
          <select
            value={mealPeriod}
            onChange={(e) => setMealPeriod(e.target.value)}
            className="appearance-none rounded-md pl-3 pr-7 py-1.5 text-xs font-medium"
            style={{
              backgroundColor: 'var(--fnb-bg-elevated)',
              color: 'var(--fnb-text-primary)',
              border: 'var(--fnb-border-subtle)',
            }}
          >
            {MEAL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--fnb-text-muted)' }} />
        </div>
      </div>

      {/* Loading / Error */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-6 w-6 rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--fnb-info)', borderTopColor: 'transparent' }} />
        </div>
      )}

      {error && (
        <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--fnb-danger)' }}>
          {error}
        </div>
      )}

      {data && !isLoading && (
        <>
          {/* KPI Row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <KpiCard
              icon={<Users size={16} />}
              label="Covers"
              value={`${data.coversSummary.actual}`}
              sub={`of ${data.coversSummary.expected} expected`}
              progress={data.coversSummary.expected > 0 ? data.coversSummary.actual / data.coversSummary.expected : 0}
              color="var(--fnb-info)"
            />
            <KpiCard
              icon={<Clock size={16} />}
              label="Wait Accuracy"
              value={`${data.waitTimeSummary.accuracyPercent}%`}
              sub={`${data.waitTimeSummary.avgQuotedMinutes}m quoted / ${data.waitTimeSummary.avgActualMinutes}m actual`}
              delta={data.waitTimeSummary.accuracyPercent >= 80 ? 'good' : 'bad'}
              color="var(--fnb-success)"
            />
            <KpiCard
              icon={<RotateCcw size={16} />}
              label="Table Turns"
              value={`${data.turnTimeSummary.totalTurns}`}
              sub={`${data.turnTimeSummary.avgMinutes}m avg`}
              delta={
                data.turnTimeSummary.previousPeriodAvg > 0
                  ? data.turnTimeSummary.avgMinutes <= data.turnTimeSummary.previousPeriodAvg
                    ? 'good' : 'bad'
                  : undefined
              }
              comparison={data.turnTimeSummary.previousPeriodAvg > 0 ? `${data.turnTimeSummary.previousPeriodAvg}m prev` : undefined}
              color="var(--fnb-warning)"
            />
            <KpiCard
              icon={<UserX size={16} />}
              label="No-Show Rate"
              value={`${data.noShowSummary.ratePercent}%`}
              sub={`${data.noShowSummary.count} of ${data.noShowSummary.totalReservations}`}
              delta={data.noShowSummary.ratePercent <= 5 ? 'good' : 'bad'}
              color="var(--fnb-danger)"
            />
            <KpiCard
              icon={<ArrowRight size={16} />}
              label="Waitlist Conv."
              value={`${data.waitlistSummary.conversionPercent}%`}
              sub={`${data.waitlistSummary.totalSeated} of ${data.waitlistSummary.totalAdded} seated`}
              delta={data.waitlistSummary.conversionPercent >= 70 ? 'good' : 'bad'}
              color="#2A9D8F"
            />
          </div>

          {/* Charts 2×2 Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ChartCard title="Covers by Hour">
              <CoversByHourChart data={data.coversByHour} />
            </ChartCard>
            <ChartCard title="Wait Time Accuracy">
              <WaitTimeAccuracyChart data={data.waitTimeScatter} />
            </ChartCard>
            <ChartCard title="Turn Time Distribution">
              <TurnTimeChart data={data.turnTimeDistribution} />
            </ChartCard>
            <ChartCard title="No-Show Trend">
              <NoShowTrendChart data={data.noShowTrend} />
            </ChartCard>
          </div>

          {/* Heatmap full-width */}
          <ChartCard title="Peak Hours Heatmap">
            <PeakHeatmap data={data.peakHeatmap} />
          </ChartCard>
        </>
      )}
    </div>
  );
}

// ── KPI Card ────────────────────────────────────────────────────

function KpiCard({
  icon,
  label,
  value,
  sub,
  progress,
  delta,
  comparison,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  progress?: number;
  delta?: 'good' | 'bad';
  comparison?: string;
  color: string;
}) {
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-1"
      style={{ backgroundColor: 'var(--fnb-bg-surface)', border: 'var(--fnb-border-subtle)' }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span style={{ color }}>{icon}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--fnb-text-muted)' }}>
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums" style={{ color: 'var(--fnb-text-primary)' }}>
          {value}
        </span>
        {delta && (
          <span className="flex items-center gap-0.5 text-xs font-medium" style={{ color: delta === 'good' ? 'var(--fnb-success)' : 'var(--fnb-danger)' }}>
            {delta === 'good' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          </span>
        )}
      </div>
      <span className="text-[11px]" style={{ color: 'var(--fnb-text-muted)' }}>{sub}</span>
      {comparison && (
        <span className="text-[10px]" style={{ color: 'var(--fnb-text-disabled)' }}>{comparison}</span>
      )}
      {progress !== undefined && (
        <div className="mt-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.min(100, Math.round(progress * 100))}%`, backgroundColor: color }}
          />
        </div>
      )}
    </div>
  );
}

// ── Chart Wrapper ───────────────────────────────────────────────

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ backgroundColor: 'var(--fnb-bg-surface)', border: 'var(--fnb-border-subtle)' }}
    >
      <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--fnb-text-muted)' }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

// ── Covers by Hour (Bar Chart) ──────────────────────────────────

function CoversByHourChart({ data }: { data: HostAnalyticsResult['coversByHour'] }) {
  if (data.length === 0) return <EmptyChart />;
  const max = Math.max(...data.map((d) => d.reservationCovers + d.walkInCovers), 1);
  return (
    <div className="flex items-end gap-1 h-40">
      {data.map((d) => {
        const resH = (d.reservationCovers / max) * 100;
        const walkH = (d.walkInCovers / max) * 100;
        return (
          <div key={d.hour} className="flex-1 flex flex-col items-center gap-0.5">
            <div className="w-full flex flex-col items-center" style={{ height: '128px' }}>
              <div className="w-full flex flex-col-reverse items-center flex-1">
                <div
                  className="w-full rounded-t-sm"
                  style={{ height: `${resH}%`, backgroundColor: 'var(--fnb-info)', minHeight: d.reservationCovers > 0 ? '2px' : '0' }}
                />
                <div
                  className="w-full"
                  style={{ height: `${walkH}%`, backgroundColor: '#2A9D8F', minHeight: d.walkInCovers > 0 ? '2px' : '0' }}
                />
              </div>
            </div>
            <span className="text-[9px] tabular-nums" style={{ color: 'var(--fnb-text-disabled)' }}>
              {d.hour}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Wait Time Accuracy (Scatter) ────────────────────────────────

function WaitTimeAccuracyChart({ data }: { data: HostAnalyticsResult['waitTimeScatter'] }) {
  if (data.length === 0) return <EmptyChart />;
  const maxVal = Math.max(...data.map((d) => Math.max(d.quotedMinutes, d.actualMinutes)), 10);
  const scale = 140 / maxVal;
  return (
    <div className="relative h-40 w-full" style={{ backgroundColor: 'var(--fnb-bg-elevated)', borderRadius: '8px' }}>
      {/* 45° reference line */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 200 140" preserveAspectRatio="none">
        <line x1="0" y1="140" x2="200" y2="0" stroke="var(--fnb-text-disabled)" strokeWidth="0.5" strokeDasharray="4 2" />
      </svg>
      {/* Dots */}
      {data.slice(0, 100).map((d, i) => {
        const x = (d.quotedMinutes * scale / 140) * 100;
        const y = 100 - (d.actualMinutes * scale / 140) * 100;
        const sizeColor = d.partySize <= 2 ? 'var(--fnb-success)' : d.partySize <= 4 ? 'var(--fnb-info)' : 'var(--fnb-warning)';
        return (
          <div
            key={i}
            className="absolute h-2 w-2 rounded-full"
            style={{
              left: `${Math.min(98, Math.max(1, x))}%`,
              top: `${Math.min(98, Math.max(1, y))}%`,
              backgroundColor: sizeColor,
              opacity: 0.7,
            }}
            title={`Party ${d.partySize}: Quoted ${d.quotedMinutes}m, Actual ${d.actualMinutes}m`}
          />
        );
      })}
      {/* Axis labels */}
      <span className="absolute bottom-1 right-2 text-[9px]" style={{ color: 'var(--fnb-text-disabled)' }}>Quoted</span>
      <span className="absolute top-1 left-1 text-[9px]" style={{ color: 'var(--fnb-text-disabled)' }}>Actual</span>
    </div>
  );
}

// ── Turn Time Distribution (Histogram) ──────────────────────────

const TURN_COLORS = ['#2D9D78', '#2A9D8F', '#3b82f6', '#eab308', '#E17C0E', '#E63946'];

function TurnTimeChart({ data }: { data: HostAnalyticsResult['turnTimeDistribution'] }) {
  if (data.length === 0) return <EmptyChart />;
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="flex items-end gap-2 h-40">
      {data.map((d, i) => {
        const h = (d.count / max) * 100;
        return (
          <div key={d.bucketLabel} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full flex flex-col-reverse items-center" style={{ height: '120px' }}>
              <div
                className="w-full rounded-t-md transition-all"
                style={{ height: `${h}%`, backgroundColor: TURN_COLORS[i % TURN_COLORS.length], minHeight: d.count > 0 ? '2px' : '0' }}
              />
            </div>
            <span className="text-[9px] font-medium" style={{ color: 'var(--fnb-text-muted)' }}>
              {d.bucketLabel}
            </span>
            <span className="text-[9px] font-bold tabular-nums" style={{ color: 'var(--fnb-text-secondary)' }}>
              {d.count}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── No-Show Trend (Bars + Line) ─────────────────────────────────

function NoShowTrendChart({ data }: { data: HostAnalyticsResult['noShowTrend'] }) {
  if (data.length === 0) return <EmptyChart />;
  const max = Math.max(...data.map((d) => Math.max(d.count, d.movingAvg7d)), 1);
  return (
    <div className="relative h-40">
      <div className="flex items-end gap-0.5 h-full">
        {data.map((d) => {
          const h = (d.count / max) * 100;
          return (
            <div key={d.date} className="flex-1 flex flex-col-reverse items-center h-full">
              <div
                className="w-full rounded-t-sm"
                style={{
                  height: `${h}%`,
                  backgroundColor: 'rgba(239, 68, 68, 0.3)',
                  minHeight: d.count > 0 ? '2px' : '0',
                }}
              />
            </div>
          );
        })}
      </div>
      {/* Moving average line overlay */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
        <polyline
          points={data
            .map((d, i) => {
              const x = ((i + 0.5) / data.length) * 100;
              const y = 100 - (d.movingAvg7d / max) * 100;
              return `${x}%,${y}%`;
            })
            .join(' ')}
          fill="none"
          stroke="var(--fnb-danger)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

// ── Peak Heatmap (CSS Grid) ─────────────────────────────────────

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function PeakHeatmap({ data }: { data: HostAnalyticsResult['peakHeatmap'] }) {
  if (data.length === 0) return <EmptyChart />;

  // Build a map dayOfWeek → hour → covers
  const maxCovers = Math.max(...data.map((d) => d.covers), 1);
  const cellMap = new Map<string, number>();
  for (const d of data) {
    cellMap.set(`${d.dayOfWeek}-${d.hour}`, d.covers);
  }

  const hours = Array.from({ length: 16 }, (_, i) => i + 6); // 6AM to 9PM

  return (
    <div className="overflow-x-auto">
      <div
        className="grid gap-[2px]"
        style={{
          gridTemplateColumns: `40px repeat(${hours.length}, 1fr)`,
          gridTemplateRows: `24px repeat(7, 24px)`,
        }}
      >
        {/* Empty corner */}
        <div />
        {/* Hour headers */}
        {hours.map((h) => (
          <div
            key={`h-${h}`}
            className="flex items-center justify-center text-[9px] tabular-nums"
            style={{ color: 'var(--fnb-text-disabled)' }}
          >
            {h}
          </div>
        ))}

        {/* Day rows */}
        {Array.from({ length: 7 }, (_, day) => (
          <>
            <div
              key={`day-${day}`}
              className="flex items-center text-[10px] font-medium pr-1"
              style={{ color: 'var(--fnb-text-muted)' }}
            >
              {DAY_LABELS[day]}
            </div>
            {hours.map((h) => {
              const covers = cellMap.get(`${day}-${h}`) ?? 0;
              const intensity = covers / maxCovers;
              return (
                <div
                  key={`${day}-${h}`}
                  className="rounded-sm cursor-default"
                  style={{
                    backgroundColor: intensity > 0
                      ? `rgba(59, 130, 246, ${0.1 + intensity * 0.8})`
                      : 'var(--fnb-bg-elevated)',
                  }}
                  title={`${DAY_LABELS[day]} ${h}:00: ${covers} covers`}
                />
              );
            })}
          </>
        ))}
      </div>
    </div>
  );
}

// ── Empty State ─────────────────────────────────────────────────

function EmptyChart() {
  return (
    <div className="flex items-center justify-center h-32">
      <span className="text-xs" style={{ color: 'var(--fnb-text-disabled)' }}>No data for this period</span>
    </div>
  );
}
