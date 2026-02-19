'use client';

import { useCallback } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, RotateCcw } from 'lucide-react';
import {
  computeDateRange,
  detectPreset,
  shiftDateRange,
  DATE_PRESET_OPTIONS,
} from '@/lib/date-presets';
import type { DatePreset } from '@/lib/date-presets';

// ── Types ────────────────────────────────────────────────────────

interface ReportFilterBarProps {
  /** Current date range start (YYYY-MM-DD) */
  dateFrom: string;
  /** Current date range end (YYYY-MM-DD) */
  dateTo: string;
  /** Currently active preset */
  preset: DatePreset;
  /** Called when date range or preset changes */
  onDateChange: (from: string, to: string, preset: DatePreset) => void;
  /** Currently selected location ID ('' = all locations) */
  locationId: string;
  /** Called when location changes */
  onLocationChange: (locationId: string) => void;
  /** Available locations. Location selector hidden when <= 1 item. */
  locations: Array<{ id: string; name: string }>;
  /** Whether data is currently loading */
  isLoading?: boolean;
  /** Called when user clicks refresh */
  onRefresh?: () => void;
  /** Called when user clicks reset */
  onReset?: () => void;
  /** Additional CSS classes */
  className?: string;
  /** Hide the location selector */
  hideLocation?: boolean;
}

// ── Component ────────────────────────────────────────────────────

export function ReportFilterBar({
  dateFrom,
  dateTo,
  preset,
  onDateChange,
  locationId,
  onLocationChange,
  locations,
  isLoading = false,
  onRefresh,
  onReset,
  className,
  hideLocation = false,
}: ReportFilterBarProps) {
  // ── Handlers ─────────────────────────────────────────────────

  const handlePresetChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newPreset = e.target.value as DatePreset;
      if (newPreset === 'custom') return; // user must manually set dates
      const range = computeDateRange(newPreset);
      onDateChange(range.from, range.to, newPreset);
    },
    [onDateChange],
  );

  const handleDateFromChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newFrom = e.target.value;
      const detected = detectPreset(newFrom, dateTo);
      onDateChange(newFrom, dateTo, detected);
    },
    [dateTo, onDateChange],
  );

  const handleDateToChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newTo = e.target.value;
      const detected = detectPreset(dateFrom, newTo);
      onDateChange(dateFrom, newTo, detected);
    },
    [dateFrom, onDateChange],
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

  const showLocation = !hideLocation && locations.length > 1;

  const relativeOpts = DATE_PRESET_OPTIONS.filter(
    (o) => o.group === 'relative' && o.value !== 'custom',
  );
  const toDateOpts = DATE_PRESET_OPTIONS.filter((o) => o.group === 'to_date');
  const priorOpts = DATE_PRESET_OPTIONS.filter((o) => o.group === 'prior_period');

  // ── Render ───────────────────────────────────────────────────

  return (
    <div
      className={`relative sticky top-0 z-30 -mx-4 border-b border-gray-200 bg-surface px-4 py-3 md:-mx-6 md:px-6 ${className ?? ''}`}
    >
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        {/* Preset dropdown */}
        <select
          value={preset}
          onChange={handlePresetChange}
          className="rounded-lg border border-gray-200 bg-surface px-3 py-2 text-sm font-medium text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          aria-label="Date range preset"
        >
          <optgroup label="Relative">
            {relativeOpts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="To Date">
            {toDateOpts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Prior Period">
            {priorOpts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
          <option value="custom">Custom</option>
        </select>

        {/* Shift back */}
        <button
          type="button"
          onClick={handleShiftBack}
          className="rounded-lg border border-gray-200 p-2 text-gray-500 transition-colors hover:bg-gray-50"
          aria-label="Previous period"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Date inputs */}
        <input
          type="date"
          value={dateFrom}
          onChange={handleDateFromChange}
          max={dateTo}
          aria-label="Start date"
          className="rounded-lg border border-gray-200 bg-surface px-3 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <span className="text-sm text-gray-400">&ndash;</span>
        <input
          type="date"
          value={dateTo}
          onChange={handleDateToChange}
          min={dateFrom}
          aria-label="End date"
          className="rounded-lg border border-gray-200 bg-surface px-3 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />

        {/* Shift forward */}
        <button
          type="button"
          onClick={handleShiftForward}
          className="rounded-lg border border-gray-200 p-2 text-gray-500 transition-colors hover:bg-gray-50"
          aria-label="Next period"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        {/* Spacer */}
        <div className="hidden flex-1 sm:block" />

        {/* Location selector */}
        {showLocation && (
          <select
            value={locationId}
            onChange={(e) => onLocationChange(e.target.value)}
            className="rounded-lg border border-gray-200 bg-surface px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            aria-label="Location"
          >
            <option value="">All Locations</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
        )}

        {/* Refresh */}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-lg border border-gray-200 p-2 text-gray-600 transition-colors hover:bg-gray-50"
            aria-label="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        )}

        {/* Reset */}
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="rounded-lg border border-gray-200 p-2 text-gray-500 transition-colors hover:bg-gray-50"
            aria-label="Reset filters"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Loading indicator bar */}
      {isLoading && (
        <div className="absolute right-0 bottom-0 left-0 h-0.5 overflow-hidden">
          <div className="h-full w-full animate-pulse bg-indigo-500" />
        </div>
      )}
    </div>
  );
}
