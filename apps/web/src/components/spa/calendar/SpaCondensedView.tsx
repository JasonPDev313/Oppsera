'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import type { DaySlotSummary, AvailabilityCategorySummary } from '@/hooks/use-spa';

interface SpaCondensedViewProps {
  days: DaySlotSummary[];
  categories: AvailabilityCategorySummary[];
  onSelectDate: (date: string, categoryId: string) => void;
}

function formatDateShort(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function SpaCondensedView({
  days,
  categories,
  onSelectDate,
}: SpaCondensedViewProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const activeCategoryId = selectedCategoryId ?? categories[0]?.id ?? null;
  const activeCategoryName = activeCategoryId === '__all__'
    ? 'All Services'
    : categories.find((c) => c.id === activeCategoryId)?.name ?? '';

  const totalServices = categories.reduce((s, c) => s + c.serviceCount, 0);

  // ── KPI computations ─────────────────────────────────────────
  const kpis = useMemo(() => {
    if (days.length === 0) {
      return { avgSlots: 0, bestDate: '', bestSlots: 0, fullyBooked: 0, totalProviders: 0 };
    }
    const sumSlots = days.reduce((s, d) => s + d.availableSlots, 0);
    const avgSlots = sumSlots / days.length;
    const fullyBooked = days.filter((d) => d.availableSlots === 0 && d.totalSlots > 0).length;
    const maxProviders = Math.max(...days.map((d) => d.providerCount));
    let bestDate = days[0]!.date;
    let bestSlots = days[0]!.availableSlots;
    for (const d of days) {
      if (d.availableSlots > bestSlots) {
        bestDate = d.date;
        bestSlots = d.availableSlots;
      }
    }
    return { avgSlots, bestDate, bestSlots, fullyBooked, totalProviders: maxProviders };
  }, [days]);

  // ── Date range label ─────────────────────────────────────────
  const rangeLabel = days.length > 0
    ? `${formatDateShort(days[0]!.date)} \u2013 ${formatDateShort(days[days.length - 1]!.date)}`
    : '';

  const [todayStr, setTodayStr] = useState('');
  useEffect(() => { setTodayStr(formatDate(new Date())); }, []);
  const todayRowRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const row = todayRowRef.current;
    const container = scrollContainerRef.current;
    if (row && container) {
      const rowTop = row.offsetTop - container.offsetTop;
      container.scrollTop = rowTop;
    }
  }, [days.length, todayStr]);

  return (
    <div className="flex min-h-0 flex-1 gap-0 rounded-lg border border-border bg-surface">
      {/* ── Left sidebar ────────────────────────────────────── */}
      <div className="w-64 shrink-0 overflow-y-auto border-r border-border py-4">
        <div className="px-4 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Service Categories
        </div>
        <div className="space-y-0.5 px-2">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCategoryId(c.id)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors ${
                activeCategoryId === c.id
                  ? 'border border-amber-600/60 bg-amber-500/10'
                  : 'border border-transparent hover:bg-accent'
              }`}
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground">{c.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {c.serviceCount} {c.serviceCount === 1 ? 'service' : 'services'}
                </div>
              </div>
              <span className={`ml-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                activeCategoryId === c.id ? 'bg-amber-700 text-white' : 'bg-muted text-muted-foreground'
              }`}>
                {c.serviceCount}
              </span>
            </button>
          ))}
        </div>

        {/* All services */}
        <div className="mt-3 border-t border-border px-4 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          All Services
        </div>
        <div className="px-2">
          <button
            onClick={() => setSelectedCategoryId('__all__')}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors ${
              activeCategoryId === '__all__'
                ? 'border border-amber-600/60 bg-amber-500/10'
                : 'border border-transparent hover:bg-accent/50'
            }`}
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">Combined View</div>
              <div className="text-[11px] text-muted-foreground">{totalServices} total services</div>
            </div>
            <span className={`ml-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
              activeCategoryId === '__all__' ? 'bg-amber-700 text-white' : 'bg-muted/80 text-muted-foreground'
            }`}>
              {totalServices}
            </span>
          </button>
        </div>
      </div>

      {/* ── Main content ────────────────────────────────────── */}
      <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto p-5">
        {/* KPI cards */}
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            value={kpis.avgSlots.toFixed(1)}
            label="Avg. slots available / day"
            sub={`of ${days.length > 0 ? days[0]!.totalSlots : 0} max`}
          />
          <KpiCard
            value={kpis.bestDate ? formatDateShort(kpis.bestDate) : '\u2014'}
            label="Best availability window"
            sub={`${kpis.bestSlots} slots open`}
          />
          <KpiCard
            value={String(kpis.fullyBooked)}
            label="Fully booked days"
            sub={
              kpis.fullyBooked === 0
                ? 'Good availability \u2714'
                : `${kpis.fullyBooked} of ${days.length} days`
            }
            subColor={kpis.fullyBooked === 0 ? 'text-green-500' : 'text-amber-500'}
          />
          <KpiCard
            value={String(kpis.totalProviders)}
            label="Active providers"
            sub={activeCategoryName}
          />
        </div>

        {/* Legend */}
        <div className="mb-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <LegendDot color="bg-green-700" label="High (>60%)" />
          <LegendDot color="bg-emerald-500" label="Some (30\u201360%)" />
          <LegendDot color="bg-amber-500" label="Scarce (<30%)" />
          <LegendDot color="bg-gray-400" label="Full" />
        </div>

        {/* Section header */}
        <div className="mb-1">
          <h2 className="text-xl font-bold text-foreground">{activeCategoryName}</h2>
          <p className="text-sm text-muted-foreground">
            {kpis.totalProviders} providers &middot; {rangeLabel}
          </p>
        </div>

        {/* Day rows — pre-compute formatted labels to avoid Date/toLocaleDateString per render */}
        <DayRows days={days} todayStr={todayStr} todayRowRef={todayRowRef} activeCategoryId={activeCategoryId} onSelectDate={onSelectDate} />

        {days.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">No dates in range.</p>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────

function KpiCard({
  value,
  label,
  sub,
  subColor,
}: {
  value: string;
  label: string;
  sub: string;
  subColor?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="text-2xl font-bold text-foreground">{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xs ${subColor ?? 'text-green-500'}`}>{sub}</div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 rounded-sm ${color}`} />
      {label}
    </span>
  );
}

function availabilityDotColor(pct: number): string {
  if (pct <= 0) return 'bg-gray-400';
  if (pct < 0.3) return 'bg-amber-500';
  if (pct < 0.6) return 'bg-emerald-500';
  return 'bg-green-700';
}

// Extracted to memoize date formatting — avoids new Date() + toLocaleDateString per row per render
function DayRows({
  days,
  todayStr,
  todayRowRef,
  activeCategoryId,
  onSelectDate,
}: {
  days: DaySlotSummary[];
  todayStr: string;
  todayRowRef: React.RefObject<HTMLDivElement | null>;
  activeCategoryId: string | null;
  onSelectDate: (date: string, categoryId: string) => void;
}) {
  const formattedDays = useMemo(
    () =>
      days.map((day) => {
        const d = new Date(`${day.date}T00:00:00`);
        return {
          dayOfWeek: d.toLocaleDateString('en-US', { weekday: 'short' }),
          monthDay: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        };
      }),
    [days],
  );

  return (
    <div className="mt-3 divide-y divide-border">
      {days.map((day, idx) => {
        const { dayOfWeek, monthDay } = formattedDays[idx]!;
        const isToday = day.date === todayStr;
        const isPast = day.date < todayStr;
        const pct = day.totalSlots > 0 ? day.availableSlots / day.totalSlots : 0;
        const dotColor = availabilityDotColor(pct);
        const label = day.totalSlots === 0
          ? 'No availability'
          : day.availableSlots === 0
            ? 'Full'
            : day.availableSlots === day.totalSlots
              ? 'Available'
              : `${day.availableSlots} of ${day.totalSlots} slots available`;

        return (
          <div
            key={day.date}
            ref={isToday ? todayRowRef : undefined}
            className={`flex items-center gap-4 py-3.5${isPast ? ' opacity-50' : ''}${isToday ? ' border-l-2 border-l-amber-500 pl-3' : ''}`}
          >
            <div className="w-28 shrink-0">
              <div className={`text-lg font-bold ${isToday ? 'text-amber-500' : 'text-foreground'}`}>{monthDay}</div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{dayOfWeek}</span>
                {isToday && (
                  <span className="rounded bg-amber-700 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                    Today
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-1 items-center gap-2">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotColor}`} />
              <span className="text-sm text-foreground">{label}</span>
              {day.providerCount > 0 && (
                <span className="text-xs text-muted-foreground">
                  &middot; {day.providerCount} {day.providerCount === 1 ? 'provider' : 'providers'}
                </span>
              )}
            </div>

            <button
              onClick={() => onSelectDate(day.date, activeCategoryId ?? '')}
              disabled={isPast || day.totalSlots === 0}
              className="flex shrink-0 items-center gap-1 rounded-lg border border-input bg-surface px-3.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Select <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
