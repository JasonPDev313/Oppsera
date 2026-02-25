'use client';

import { useState, useRef, useEffect } from 'react';
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
} from 'lucide-react';
import type { ViewRange, CalendarFilters, CalendarRoom, CalendarSegment } from './types';
import { formatWeekRange, formatDateLong } from './types';

interface CalendarToolbarProps {
  viewRange: ViewRange;
  onViewRangeChange: (range: ViewRange) => void;
  viewMode: 'grid' | 'day';
  onViewModeChange: (mode: 'grid' | 'day') => void;
  weekStart: Date;
  selectedDate: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onDateClick?: (date: string) => void;
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
  pageView?: 'calendar' | 'list';
  onPageViewChange?: (view: 'calendar' | 'list') => void;
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
          {/* Calendar / List page-level toggle */}
          {pageView && onPageViewChange && (
            <div className="flex rounded-lg border border-gray-200 bg-surface">
              <button
                onClick={() => onPageViewChange('calendar')}
                className={`flex items-center gap-1.5 rounded-l-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  pageView === 'calendar' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-200/50'
                }`}
              >
                <CalendarDays className="h-3.5 w-3.5" />
                Calendar
              </button>
              <button
                onClick={() => onPageViewChange('list')}
                className={`flex items-center gap-1.5 rounded-r-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  pageView === 'list' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-200/50'
                }`}
              >
                <List className="h-3.5 w-3.5" />
                List
              </button>
            </div>
          )}

          {/* Grid / Day toggle (calendar view only) */}
          {(!pageView || pageView === 'calendar') && (
            <div className="flex rounded-lg border border-gray-200 bg-surface">
              <button
                onClick={() => onViewModeChange('grid')}
                className={`rounded-l-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === 'grid' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-200/50'
                }`}
              >
                Grid
              </button>
              <button
                onClick={() => onViewModeChange('day')}
                className={`rounded-r-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === 'day' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-200/50'
                }`}
              >
                Day
              </button>
            </div>
          )}

          {/* Range selector (only in grid mode within calendar view) */}
          {(!pageView || pageView === 'calendar') && viewMode === 'grid' && (
            <div className="flex rounded-lg border border-gray-200 bg-surface">
              {([7, 14, 30] as ViewRange[]).map((r) => (
                <button
                  key={r}
                  onClick={() => onViewRangeChange(r)}
                  className={`px-2.5 py-1.5 text-xs font-medium transition-colors first:rounded-l-lg last:rounded-r-lg ${
                    viewRange === r ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-200/50'
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
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
              placeholder="Search rooms or guests..."
              className="w-48 rounded-lg border border-gray-200 bg-surface py-1.5 pl-8 pr-3 text-xs text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {filters.search && (
              <button
                onClick={() => onFiltersChange({ ...filters, search: '' })}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                hasActiveFilters
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                  : 'border-gray-200 bg-surface text-gray-600 hover:bg-gray-200/50'
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
              <div className="absolute right-0 top-full z-30 mt-1 w-72 rounded-lg border border-gray-200 bg-surface p-3 shadow-lg">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-700">Filters</span>
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
                ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                : 'border-gray-200 bg-surface text-gray-600 hover:bg-gray-200/50'
            }`}
          >
            Legend
          </button>

          {/* Print */}
          <button
            onClick={() => window.print()}
            className="rounded-lg border border-gray-200 bg-surface p-1.5 text-gray-600 hover:bg-gray-200/50 print:hidden"
            title="Print calendar"
          >
            <Printer className="h-3.5 w-3.5" />
          </button>

          {/* New Reservation */}
          {onNewReservation && (
            <button
              onClick={onNewReservation}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700"
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
              className="rounded-lg border border-gray-200 bg-surface px-3 py-1.5 text-xs text-gray-900"
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

      {/* Row 2: Date navigation (calendar view only) */}
      {(!pageView || pageView === 'calendar') && <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-surface px-4 py-1.5">
        <button onClick={onPrev} className="rounded-md p-1 text-gray-600 hover:bg-gray-200/50">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-900">
            {viewMode === 'grid' ? formatWeekRange(weekStart, viewRange) : formatDateLong(selectedDate)}
          </span>
          <button
            onClick={onToday}
            className="rounded-md border border-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-600 hover:bg-gray-200/50"
          >
            Today
          </button>
        </div>
        <button onClick={onNext} className="rounded-md p-1 text-gray-600 hover:bg-gray-200/50">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-2 last:mb-0">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{title}</div>
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
    <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs text-gray-700 hover:bg-gray-100/50">
      <input type="checkbox" checked={checked} onChange={onChange} className="h-3 w-3 rounded border-gray-300 text-indigo-600" />
      {label}
    </label>
  );
}
