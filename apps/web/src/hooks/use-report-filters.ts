'use client';

import { useState, useCallback } from 'react';
import { computeDateRange, detectPreset, DEFAULT_PRESET } from '@/lib/date-presets';
import type { DatePreset } from '@/lib/date-presets';

interface UseReportFiltersOptions {
  /** Initial preset (default: 'month_to_date') */
  defaultPreset?: DatePreset;
  /** Initial location ID (default: '' = All Locations) */
  defaultLocationId?: string;
  /** Override initial dates — if provided, overrides the defaultPreset computation */
  initialDateFrom?: string;
  initialDateTo?: string;
}

interface UseReportFiltersReturn {
  dateFrom: string;
  dateTo: string;
  preset: DatePreset;
  locationId: string;
  setDateRange: (from: string, to: string, preset: DatePreset) => void;
  setLocationId: (id: string) => void;
  reset: () => void;
  /** locationId converted: '' → undefined (for "All Locations") */
  selectedLocationId: string | undefined;
}

export function useReportFilters(options: UseReportFiltersOptions = {}): UseReportFiltersReturn {
  const defaultPreset = options.defaultPreset ?? DEFAULT_PRESET;
  const defaultRange = computeDateRange(defaultPreset);

  const [dateFrom, setDateFrom] = useState(options.initialDateFrom ?? defaultRange.from);
  const [dateTo, setDateTo] = useState(options.initialDateTo ?? defaultRange.to);
  const [preset, setPreset] = useState<DatePreset>(() => {
    if (options.initialDateFrom && options.initialDateTo) {
      return detectPreset(options.initialDateFrom, options.initialDateTo);
    }
    return defaultPreset;
  });
  const [locationId, setLocationIdState] = useState(options.defaultLocationId ?? '');

  const setDateRange = useCallback((from: string, to: string, p: DatePreset) => {
    setDateFrom(from);
    setDateTo(to);
    setPreset(p);
  }, []);

  const setLocationId = useCallback((id: string) => {
    setLocationIdState(id);
  }, []);

  const reset = useCallback(() => {
    const range = computeDateRange(defaultPreset);
    setDateFrom(range.from);
    setDateTo(range.to);
    setPreset(defaultPreset);
    setLocationIdState(options.defaultLocationId ?? '');
  }, [defaultPreset, options.defaultLocationId]);

  const selectedLocationId = locationId || undefined;

  return {
    dateFrom,
    dateTo,
    preset,
    locationId,
    setDateRange,
    setLocationId,
    reset,
    selectedLocationId,
  };
}
