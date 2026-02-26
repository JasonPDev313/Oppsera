'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Filter,
  List,
  Plus,
  Printer,
  Search,
  X,
  Zap,
} from 'lucide-react';
import type { ViewRange, ViewMode, CalendarFilters, CalendarRoom, CalendarSegment } from './types';
import { formatWeekRange, formatDateLong, formatDate } from './types';
import DateJumpPicker from './DateJumpPicker';

interface CalendarToolbarProps {
  viewRange: ViewRange;
  onViewRangeChange: (range: ViewRange) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  weekStart: Date;
  selectedDate: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onDateClick?: (date: string) => void;
  onDateJump: (date: string) => void;
  properties: { id: string; name: string }[];
  propertyId: string;
  onPropertyChange: (id: string) => void;
  filters: CalendarFilters;
  onFiltersChange: (filters: CalendarFilters) => void;
  showLegend: boolean;
  onToggleLegend: () => void;
  rooms: CalendarRoom[];
  segments: CalendarSegment[];
  lastUpdatedAt: string | null;
  pageView?: 'quick' | 'calendar' | 'list';
  onPageViewChange?: (view: 'quick' | 'calendar' | 'list') => void;
  onNewReservation?: () => void;
}

export default function CalendarToolbar({
  viewRange,
  onViewRangeChange,
  viewMode,
  onViewModeChange,
  weekStart,
  selectedDate,
  onPrev,
  onNext,
  onToday,
  onDateJump,
  properties,
  propertyId,
  onPropertyChange,
  filters,
  onFiltersChange,
  showLegend,
  onToggleLegend,
  rooms,
  segments,
  pageView,
  onPageViewChange,
  onNewReservation,
}: CalendarToolbarProps) {
  const [showFilters, setShowFilters] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // Compute the date value for the picker
  const pickerValue = useMemo(() => {
    if (pageView === 'calendar' && viewMode === 'day') return selectedDate;
    return formatDate(weekStart); // quick view + grid both use weekStart
  }, [pageView, viewMode, weekStart, selectedDate]);

  useEffect(() => {
    if (!showFilters) return;
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setShowFilters(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showFilters]);

  // Derive unique values for filters
  const roomTypes = [...new Map(rooms.map((r) => [r.roomTypeId, r.roomTypeName])).entries()];
  const floors = [...new Set(rooms.map((r) => r.floor).filter(Boolean))] as string[];
  const statuses = [...new Set(segments.map((s) => s.status))];
  const sources = [...new Set(segments.map((s) => s.sourceType).filter(Boolean))];
  const hasActiveFilters =
    filters.roomTypes.size > 0 ||
    filters.floors.size > 0 ||
    filters.statuses.size > 0 ||
    filters.sources.size > 0 ||
    filters.search.length > 0;

  const toggleFilter = (
    key: 'roomTypes' | 'floors' | 'statuses' | 'sources',
    value: string,
  ) => {
    const next = new Set(filters[key]);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onFiltersChange({ ...filters, [key]: next });
  };

  const clearFilters = () =>
    onFiltersChange({
      roomTypes: new Set(),
      floors: new Set(),
      statuses: new Set(),
      sources: new Set(),
      search: '',
    });

  return (
    <div className="space-y-2">
      {/* Row 1: View controls + property + search */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* Quick View / Calendar / List page-level toggle */}
          {pageView && onPageViewChange && (
            <div className="flex rounded-lg border border-border bg-surface">
              {([
                { view: 'quick' as const, label: 'Quick View', Icon: Zap },
                { view: 'calendar' as const, label: 'Calendar', Icon: CalendarDays },
                { view: 'list' as const, label: 'List', Icon: List },
              ]).map(({ view, label, Icon }, i) => (
                <button
                  key={view}
                  onClick={() => onPageViewChange(view)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                    i === 0 ? 'rounded-l-lg' : ''
                  }${i === 2 ? 'rounded-r-lg' : ''} ${
                    pageView === view ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:bg-accent/50'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* View mode toggle (calendar page only) */}
          {pageView === 'calendar' && (
            <div className="flex rounded-lg border border-border bg-surface">
              {([
                { mode: 'day' as const, label: 'Summary' },
                { mode: 'grid' as const, label: 'Full grid' },
              ]).map(({ mode, label }, i) => (
                <button
                  key={mode}
                  onClick={() => onViewModeChange(mode)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    i === 0 ? 'rounded-l-lg' : ''
                  }${i === 1 ? 'rounded-r-lg' : ''} ${
                    viewMode === mode ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:bg-accent/50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Range selector (quick view + grid mode) */}
          {(pageView === 'quick' || (pageView === 'calendar' && viewMode === 'grid')) && (
            <div className="flex rounded-lg border border-border bg-surface">
              {([7, 14, 30] as ViewRange[]).map((r) => (
                <button
                  key={r}
                  onClick={() => onViewRangeChange(r)}
                  className={`px-2.5 py-1.5 text-xs font-medium transition-colors first:rounded-l-lg last:rounded-r-lg ${
                    viewRange === r ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:bg-accent/50'
                  }`}
                >
                  {r}d
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
              placeholder="Search rooms or guests..."
              className="w-48 rounded-lg border border-border bg-surface py-1.5 pl-8 pr-3 text-xs text-foreground placeholder-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {filters.search && (
              <button
                onClick={() => onFiltersChange({ ...filters, search: '' })}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                hasActiveFilters
                  ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-400'
                  : 'border-border bg-surface text-muted-foreground hover:bg-accent/50'
              }`}
            >
              <Filter className="h-3.5 w-3.5" />
              Filters
              {hasActiveFilters && (
                <span className="rounded-full bg-indigo-600 px-1.5 text-[10px] text-white">
                  {filters.roomTypes.size + filters.floors.size + filters.statuses.size + filters.sources.size}
                </span>
              )}
            </button>

            {showFilters && (
              <div className="absolute right-0 top-full z-30 mt-1 w-72 rounded-lg border border-border bg-surface p-3 shadow-lg">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">Filters</span>
                  {hasActiveFilters && (
                    <button onClick={clearFilters} className="text-[10px] text-indigo-600 hover:underline">
                      Clear all
                    </button>
                  )}
                </div>

                {roomTypes.length > 0 && (
                  <FilterSection title="Room Type">
                    {roomTypes.map(([id, name]) => (
                      <FilterCheckbox
                        key={id}
                        label={name}
                        checked={filters.roomTypes.has(id)}
                        onChange={() => toggleFilter('roomTypes', id)}
                      />
                    ))}
                  </FilterSection>
                )}

                {floors.length > 0 && (
                  <FilterSection title="Floor">
                    {floors.map((f) => (
                      <FilterCheckbox
                        key={f}
                        label={`Floor ${f}`}
                        checked={filters.floors.has(f)}
                        onChange={() => toggleFilter('floors', f)}
                      />
                    ))}
                  </FilterSection>
                )}

                {statuses.length > 0 && (
                  <FilterSection title="Status">
                    {statuses.map((s) => (
                      <FilterCheckbox
                        key={s}
                        label={s.replace('_', ' ')}
                        checked={filters.statuses.has(s)}
                        onChange={() => toggleFilter('statuses', s)}
                      />
                    ))}
                  </FilterSection>
                )}

                {sources.length > 0 && (
                  <FilterSection title="Source">
                    {sources.map((s) => (
                      <FilterCheckbox
                        key={s}
                        label={s}
                        checked={filters.sources.has(s)}
                        onChange={() => toggleFilter('sources', s)}
                      />
                    ))}
                  </FilterSection>
                )}
              </div>
            )}
          </div>

          {/* Legend toggle */}
          <button
            onClick={onToggleLegend}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              showLegend
                ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-400'
                : 'border-border bg-surface text-muted-foreground hover:bg-accent/50'
            }`}
          >
            Legend
          </button>

          {/* Print */}
          <button
            onClick={() => window.print()}
            className="rounded-lg border border-border bg-surface p-1.5 text-muted-foreground hover:bg-accent/50 print:hidden"
            title="Print calendar"
            aria-label="Print calendar"
          >
            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
          </button>

          {/* New Reservation */}
          {onNewReservation && (
            <button
              onClick={onNewReservation}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500"
            >
              <Plus className="h-3.5 w-3.5" />
              New Reservation
            </button>
          )}

          {/* Property selector */}
          {properties.length > 1 && (
            <select
              value={propertyId}
              onChange={(e) => onPropertyChange(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-foreground"
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Row 2: Date navigation (quick view + calendar, not list) */}
      {pageView !== 'list' && <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-1.5">
        <button onClick={onPrev} className="rounded-md p-1 text-muted-foreground hover:bg-accent/50" aria-label="Previous">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="flex items-center gap-3">
          <DateJumpPicker value={pickerValue} onSelect={onDateJump}>
            <span className="text-sm font-medium text-foreground">
              {pageView === 'calendar' && viewMode === 'day' ? formatDateLong(selectedDate) : formatWeekRange(weekStart, viewRange)}
            </span>
          </DateJumpPicker>
          <button
            onClick={onToday}
            className="rounded-md border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-accent/50"
          >
            Today
          </button>
        </div>
        <button onClick={onNext} className="rounded-md p-1 text-muted-foreground hover:bg-accent/50" aria-label="Next">
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-2 last:mb-0">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function FilterCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs text-foreground hover:bg-accent/50">
      <input type="checkbox" checked={checked} onChange={onChange} className="h-3 w-3 rounded border-input text-indigo-600" />
      {label}
    </label>
  );
}
