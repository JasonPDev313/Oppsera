'use client';

import {
  Users,
  CheckCircle,
  Timer,
  XCircle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HostAnalyticsResult {
  coversSummary: { actual: number; expected: number };
  waitTimeSummary: { avgQuotedMinutes: number; avgActualMinutes: number; accuracyPercent: number };
  turnTimeSummary: { totalTurns: number; avgMinutes: number; previousPeriodAvg: number };
  noShowSummary: { count: number; totalReservations: number; ratePercent: number };
  waitlistSummary: { totalAdded: number; totalSeated: number; conversionPercent: number };
  coversByHour: Array<{ hour: number; reservationCovers: number; walkInCovers: number }>;
  waitTimeScatter: Array<{ quotedMinutes: number; actualMinutes: number; partySize: number }>;
  turnTimeDistribution: Array<{ bucketLabel: string; count: number }>;
  noShowTrend: Array<{ date: string; count: number; movingAvg7d: number }>;
  peakHeatmap: Array<{ dayOfWeek: number; hour: number; covers: number }>;
}

interface WaitlistAnalyticsProps {
  analytics: HostAnalyticsResult | null;
  isLoading: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 14 }, (_, i) => i + 10); // 10–23

function formatHour(h: number): string {
  if (h === 12) return '12p';
  if (h === 0) return '12a';
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

// ---------------------------------------------------------------------------
// Skeleton helpers
// ---------------------------------------------------------------------------

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded bg-muted ${className ?? ''}`} />
  );
}

// ---------------------------------------------------------------------------
// Summary Card
// ---------------------------------------------------------------------------

interface SummaryCardProps {
  icon: React.ReactNode;
  label: string;
  primary: string;
  secondary?: string;
  accentClass?: string;
}

function SummaryCard({ icon, label, primary, secondary, accentClass = 'text-foreground' }: SummaryCardProps) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-card border border-border px-4 py-3 min-w-0">
      <div className="flex items-center gap-2 text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">
        <span className="shrink-0">{icon}</span>
        {label}
      </div>
      <div className={`text-2xl font-bold tabular-nums leading-none tracking-tight ${accentClass}`}>
        {primary}
      </div>
      {secondary && (
        <div className="text-[11px] text-muted-foreground leading-tight">{secondary}</div>
      )}
    </div>
  );
}

function SummaryCardSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-card border border-border px-4 py-3">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-16" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section title
// ---------------------------------------------------------------------------

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
      {children}
    </h3>
  );
}

// ---------------------------------------------------------------------------
// Wait Accuracy Chart (CSS-only bar comparison)
// ---------------------------------------------------------------------------

interface WaitAccuracyProps {
  avgQuoted: number;
  avgActual: number;
  accuracyPercent: number;
}

function WaitAccuracyChart({ avgQuoted, avgActual, accuracyPercent }: WaitAccuracyProps) {
  const maxVal = Math.max(avgQuoted, avgActual, 1);
  const quotedPct = Math.round((avgQuoted / maxVal) * 100);
  const actualPct = Math.round((avgActual / maxVal) * 100);

  const accuracyColor =
    accuracyPercent >= 85
      ? 'text-emerald-400'
      : accuracyPercent >= 70
        ? 'text-amber-400'
        : 'text-red-400';

  return (
    <div className="rounded-xl bg-card border border-border px-4 py-3">
      <SectionTitle>Wait Time Accuracy</SectionTitle>
      <div className="flex flex-col gap-2.5">
        {/* Quoted bar */}
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-[11px] text-muted-foreground">Quoted</span>
            <span className="text-[12px] font-semibold tabular-nums text-foreground">
              {avgQuoted}m
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-500"
              style={{ width: `${quotedPct}%` }}
            />
          </div>
        </div>

        {/* Actual bar */}
        <div>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-[11px] text-muted-foreground">Actual</span>
            <span className="text-[12px] font-semibold tabular-nums text-foreground">
              {avgActual}m
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-violet-500"
              style={{ width: `${actualPct}%` }}
            />
          </div>
        </div>

        {/* Accuracy score */}
        <div className="flex items-center justify-between pt-1 border-t border-border">
          <span className="text-[11px] text-muted-foreground">Accuracy</span>
          <span className={`text-sm font-bold tabular-nums ${accuracyColor}`}>
            {accuracyPercent}%
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Peak Hours Heatmap (7 days × 14 hours)
// ---------------------------------------------------------------------------

interface PeakHeatmapProps {
  data: Array<{ dayOfWeek: number; hour: number; covers: number }>;
}

function PeakHeatmap({ data }: PeakHeatmapProps) {
  // Build lookup: [day][hour] = covers
  const lookup = new Map<string, number>();
  let maxCovers = 1;

  for (const row of data) {
    const key = `${row.dayOfWeek}-${row.hour}`;
    lookup.set(key, row.covers);
    if (row.covers > maxCovers) maxCovers = row.covers;
  }

  function intensity(covers: number): string {
    if (covers === 0) return 'bg-muted';
    const ratio = covers / maxCovers;
    if (ratio < 0.2) return 'bg-indigo-900/40';
    if (ratio < 0.4) return 'bg-indigo-700/50';
    if (ratio < 0.6) return 'bg-indigo-600/65';
    if (ratio < 0.8) return 'bg-indigo-500/80';
    return 'bg-indigo-400';
  }

  return (
    <div className="rounded-xl bg-card border border-border px-4 py-3 overflow-x-auto">
      <SectionTitle>Peak Hours Heatmap</SectionTitle>
      <div className="min-w-[520px]">
        {/* Hour header row */}
        <div className="flex gap-0.5 mb-0.5 pl-8">
          {HOURS.map((h) => (
            <div
              key={h}
              className="flex-1 text-center text-[9px] text-muted-foreground font-medium leading-none"
            >
              {formatHour(h)}
            </div>
          ))}
        </div>

        {/* Day rows */}
        {DAY_LABELS.map((day, dayIdx) => (
          <div key={day} className="flex items-center gap-0.5 mb-0.5">
            <div className="w-8 shrink-0 text-[10px] text-muted-foreground font-medium text-right pr-1.5">
              {day}
            </div>
            {HOURS.map((h) => {
              const covers = lookup.get(`${dayIdx}-${h}`) ?? 0;
              return (
                <div
                  key={h}
                  className={`flex-1 h-4 rounded-[2px] transition-colors ${intensity(covers)}`}
                  title={`${day} ${formatHour(h)}: ${covers} covers`}
                />
              );
            })}
          </div>
        ))}

        {/* Legend */}
        <div className="flex items-center gap-1.5 mt-2 justify-end">
          <span className="text-[9px] text-muted-foreground">Low</span>
          {['bg-indigo-900/40', 'bg-indigo-700/50', 'bg-indigo-600/65', 'bg-indigo-500/80', 'bg-indigo-400'].map(
            (cls, i) => (
              <div key={i} className={`h-2.5 w-4 rounded-[2px] ${cls}`} />
            ),
          )}
          <span className="text-[9px] text-muted-foreground">High</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hourly Covers (horizontal stacked bars)
// ---------------------------------------------------------------------------

interface HourlyCoverChartProps {
  data: Array<{ hour: number; reservationCovers: number; walkInCovers: number }>;
}

function HourlyCoverChart({ data }: HourlyCoverChartProps) {
  const sorted = [...data].sort((a, b) => a.hour - b.hour);
  const maxTotal = Math.max(...sorted.map((r) => r.reservationCovers + r.walkInCovers), 1);

  return (
    <div className="rounded-xl bg-card border border-border px-4 py-3">
      <SectionTitle>Covers by Hour</SectionTitle>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-3">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-3 rounded-sm bg-blue-500" />
          <span className="text-[10px] text-muted-foreground">Reservation</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-3 rounded-sm bg-emerald-500" />
          <span className="text-[10px] text-muted-foreground">Walk-in</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {sorted.map((row) => {
          const total = row.reservationCovers + row.walkInCovers;
          const resPct = maxTotal > 0 ? (row.reservationCovers / maxTotal) * 100 : 0;
          const walkPct = maxTotal > 0 ? (row.walkInCovers / maxTotal) * 100 : 0;

          return (
            <div key={row.hour} className="flex items-center gap-2">
              <span className="w-7 shrink-0 text-[10px] text-muted-foreground text-right tabular-nums">
                {formatHour(row.hour)}
              </span>
              <div className="flex flex-1 h-3 rounded-sm overflow-hidden bg-muted gap-[1px]">
                {row.reservationCovers > 0 && (
                  <div
                    className="h-full bg-blue-500 rounded-l-sm"
                    style={{ width: `${resPct}%` }}
                    title={`${row.reservationCovers} reservation`}
                  />
                )}
                {row.walkInCovers > 0 && (
                  <div
                    className="h-full bg-emerald-500 rounded-r-sm"
                    style={{ width: `${walkPct}%` }}
                    title={`${row.walkInCovers} walk-in`}
                  />
                )}
              </div>
              <span className="w-8 shrink-0 text-[10px] tabular-nums text-muted-foreground">
                {total}
              </span>
            </div>
          );
        })}
        {sorted.length === 0 && (
          <p className="text-[11px] text-muted-foreground text-center py-4">
            No hourly data for this period.
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function WaitlistAnalytics({ analytics, isLoading }: WaitlistAnalyticsProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4">
        {/* Summary skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <SummaryCardSkeleton key={i} />
          ))}
        </div>

        {/* Charts skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
        No analytics data available for the selected period.
      </div>
    );
  }

  const { waitlistSummary, waitTimeSummary, noShowSummary, coversByHour, peakHeatmap } = analytics;

  // Conversion colour
  const conversionColor =
    waitlistSummary.conversionPercent >= 80
      ? 'text-emerald-400'
      : waitlistSummary.conversionPercent >= 60
        ? 'text-amber-400'
        : 'text-red-400';

  // No-show colour
  const noShowColor =
    noShowSummary.ratePercent <= 5
      ? 'text-emerald-400'
      : noShowSummary.ratePercent <= 15
        ? 'text-amber-400'
        : 'text-red-400';

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* ------------------------------------------------------------------ */}
      {/* 1. Summary Cards Row                                                */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard
          icon={<Users size={13} />}
          label="Total Joined"
          primary={String(waitlistSummary.totalAdded)}
          secondary="Added to waitlist"
        />
        <SummaryCard
          icon={<CheckCircle size={13} />}
          label="Seated"
          primary={String(waitlistSummary.totalSeated)}
          secondary={`${waitlistSummary.conversionPercent}% conversion`}
          accentClass={conversionColor}
        />
        <SummaryCard
          icon={<Timer size={13} />}
          label="Avg Wait"
          primary={`${waitTimeSummary.avgActualMinutes}m`}
          secondary={`Quoted ${waitTimeSummary.avgQuotedMinutes}m · ${waitTimeSummary.accuracyPercent}% accuracy`}
        />
        <SummaryCard
          icon={<XCircle size={13} />}
          label="No-Show Rate"
          primary={`${noShowSummary.ratePercent}%`}
          secondary={`${noShowSummary.count} of ${noShowSummary.totalReservations} reservations`}
          accentClass={noShowColor}
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 2. Wait Accuracy Chart + Hourly Covers (side by side on wider)      */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <WaitAccuracyChart
          avgQuoted={waitTimeSummary.avgQuotedMinutes}
          avgActual={waitTimeSummary.avgActualMinutes}
          accuracyPercent={waitTimeSummary.accuracyPercent}
        />
        <HourlyCoverChart data={coversByHour} />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 3. Peak Hours Heatmap                                               */}
      {/* ------------------------------------------------------------------ */}
      <PeakHeatmap data={peakHeatmap} />
    </div>
  );
}
