'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';

// ── Types ────────────────────────────────────────────────────────

export interface ModifierPerformanceRow {
  modifierId: string;
  modifierName: string;
  modifierGroupId: string;
  groupName: string;
  timesSelected: number;
  revenueDollars: number;
  extraRevenueDollars: number;
  instructionNone: number;
  instructionExtra: number;
  instructionOnSide: number;
  instructionDefault: number;
  voidCount: number;
  voidRevenueDollars: number;
}

export interface ModifierGroupHealthRow {
  modifierGroupId: string;
  groupName: string;
  isRequired: boolean;
  eligibleLineCount: number;
  linesWithSelection: number;
  attachRate: number;
  totalSelections: number;
  uniqueModifiers: number;
  avgSelectionsPerCheck: number;
  revenueImpactDollars: number;
  voidCount: number;
  recommendation: string;
}

export interface UpsellImpactRow {
  modifierId: string;
  modifierName: string;
  groupName: string;
  timesSelected: number;
  revenueDollars: number;
  costDollars: number | null;
  marginDollars: number | null;
  marginPercent: number | null;
}

export interface DaypartHeatmapRow {
  modifierId: string;
  modifierName: string;
  daypart: string;
  timesSelected: number;
  revenueDollars: number;
}

export interface GroupItemHeatmapRow {
  modifierGroupId: string;
  groupName: string;
  catalogItemId: string;
  itemName: string;
  attachRate: number;
  timesSelected: number;
}

export interface LocationHeatmapRow {
  locationId: string;
  locationName: string;
  modifierGroupId: string;
  groupName: string;
  eligibleLineCount: number;
  linesWithSelection: number;
  attachRate: number;
  revenueImpactDollars: number;
}

export interface WasteSignalRow {
  modifierId: string;
  modifierName: string;
  groupName: string;
  timesSelected: number;
  voidCount: number;
  voidRate: number;
  voidRevenueDollars: number;
}

export interface ComplexityRow {
  catalogItemId: string;
  catalogItemName: string;
  distinctModifiers: number;
  distinctGroups: number;
  totalSelections: number;
  avgModifiersPerOrder: number;
  complexityScore: number;
}

// ── Helpers ──────────────────────────────────────────────────────

function buildParams(entries: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(entries)) {
    if (v !== undefined) params.set(k, v);
  }
  return params.toString();
}

function getDefaultDateRange(): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const dateTo = now.toISOString().slice(0, 10);
  const from = new Date(now);
  from.setDate(from.getDate() - 30);
  const dateFrom = from.toISOString().slice(0, 10);
  return { dateFrom, dateTo };
}

export async function downloadModifierExport(
  endpoint: string,
  params: Record<string, string | undefined>,
) {
  const qs = buildParams(params);
  const url = qs ? `${endpoint}?${qs}` : endpoint;
  const token =
    typeof window !== 'undefined'
      ? localStorage.getItem('oppsera_access_token')
      : null;

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);

  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);

  const disposition = res.headers.get('Content-Disposition');
  const filenameMatch = disposition?.match(/filename="?([^"]+)"?/);
  const filename = filenameMatch?.[1] ?? 'export.csv';

  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

// ── useModifierPerformance ───────────────────────────────────────

export function useModifierPerformance(
  dateFrom?: string,
  dateTo?: string,
  locationId?: string,
  modifierGroupId?: string,
  sortBy?: string,
  sortDir?: string,
  limit?: number,
) {
  const [data, setData] = useState<ModifierPerformanceRow[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const defaults = getDefaultDateRange();
  const resolvedFrom = dateFrom ?? defaults.dateFrom;
  const resolvedTo = dateTo ?? defaults.dateTo;

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const qs = buildParams({
        dateFrom: resolvedFrom,
        dateTo: resolvedTo,
        locationId,
        modifierGroupId,
        sortBy,
        sortDir,
        limit: limit ? String(limit) : undefined,
      });
      const res = await apiFetch<{ data: ModifierPerformanceRow[] }>(
        `/api/v1/reports/modifiers/performance?${qs}`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load modifier performance'));
    } finally {
      setIsLoading(false);
    }
  }, [resolvedFrom, resolvedTo, locationId, modifierGroupId, sortBy, sortDir, limit]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refresh: fetchData };
}

// ── useModifierGroupHealth ───────────────────────────────────────

export function useModifierGroupHealth(
  dateFrom?: string,
  dateTo?: string,
  locationId?: string,
) {
  const [data, setData] = useState<ModifierGroupHealthRow[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const defaults = getDefaultDateRange();
  const resolvedFrom = dateFrom ?? defaults.dateFrom;
  const resolvedTo = dateTo ?? defaults.dateTo;

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const qs = buildParams({
        dateFrom: resolvedFrom,
        dateTo: resolvedTo,
        locationId,
      });
      const res = await apiFetch<{ data: ModifierGroupHealthRow[] }>(
        `/api/v1/reports/modifiers/group-health?${qs}`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load modifier group health'));
    } finally {
      setIsLoading(false);
    }
  }, [resolvedFrom, resolvedTo, locationId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refresh: fetchData };
}

// ── useModifierUpsellImpact ──────────────────────────────────────

export function useModifierUpsellImpact(
  dateFrom?: string,
  dateTo?: string,
  locationId?: string,
  modifierGroupId?: string,
  limit?: number,
) {
  const [data, setData] = useState<UpsellImpactRow[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const defaults = getDefaultDateRange();
  const resolvedFrom = dateFrom ?? defaults.dateFrom;
  const resolvedTo = dateTo ?? defaults.dateTo;

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const qs = buildParams({
        dateFrom: resolvedFrom,
        dateTo: resolvedTo,
        locationId,
        modifierGroupId,
        limit: limit ? String(limit) : undefined,
      });
      const res = await apiFetch<{ data: UpsellImpactRow[] }>(
        `/api/v1/reports/modifiers/upsell-impact?${qs}`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load upsell impact'));
    } finally {
      setIsLoading(false);
    }
  }, [resolvedFrom, resolvedTo, locationId, modifierGroupId, limit]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refresh: fetchData };
}

// ── useModifierDaypartHeatmap ────────────────────────────────────

export function useModifierDaypartHeatmap(
  dateFrom?: string,
  dateTo?: string,
  locationId?: string,
  modifierGroupId?: string,
) {
  const [data, setData] = useState<DaypartHeatmapRow[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const defaults = getDefaultDateRange();
  const resolvedFrom = dateFrom ?? defaults.dateFrom;
  const resolvedTo = dateTo ?? defaults.dateTo;

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const qs = buildParams({
        dateFrom: resolvedFrom,
        dateTo: resolvedTo,
        locationId,
        modifierGroupId,
      });
      const res = await apiFetch<{ data: DaypartHeatmapRow[] }>(
        `/api/v1/reports/modifiers/daypart-heatmap?${qs}`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load daypart heatmap'));
    } finally {
      setIsLoading(false);
    }
  }, [resolvedFrom, resolvedTo, locationId, modifierGroupId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refresh: fetchData };
}

// ── useModifierGroupItemHeatmap ──────────────────────────────────

export function useModifierGroupItemHeatmap(
  dateFrom?: string,
  dateTo?: string,
  locationId?: string,
) {
  const [data, setData] = useState<GroupItemHeatmapRow[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const defaults = getDefaultDateRange();
  const resolvedFrom = dateFrom ?? defaults.dateFrom;
  const resolvedTo = dateTo ?? defaults.dateTo;

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const qs = buildParams({
        dateFrom: resolvedFrom,
        dateTo: resolvedTo,
        locationId,
      });
      const res = await apiFetch<{ data: GroupItemHeatmapRow[] }>(
        `/api/v1/reports/modifiers/group-item-heatmap?${qs}`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load group-item heatmap'));
    } finally {
      setIsLoading(false);
    }
  }, [resolvedFrom, resolvedTo, locationId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refresh: fetchData };
}

// ── useModifierLocationHeatmap ───────────────────────────────────

export function useModifierLocationHeatmap(
  dateFrom?: string,
  dateTo?: string,
  modifierGroupId?: string,
) {
  const [data, setData] = useState<LocationHeatmapRow[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const defaults = getDefaultDateRange();
  const resolvedFrom = dateFrom ?? defaults.dateFrom;
  const resolvedTo = dateTo ?? defaults.dateTo;

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const qs = buildParams({
        dateFrom: resolvedFrom,
        dateTo: resolvedTo,
        modifierGroupId,
      });
      const res = await apiFetch<{ data: LocationHeatmapRow[] }>(
        `/api/v1/reports/modifiers/location-heatmap?${qs}`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load location heatmap'));
    } finally {
      setIsLoading(false);
    }
  }, [resolvedFrom, resolvedTo, modifierGroupId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refresh: fetchData };
}

// ── useModifierWasteSignals ──────────────────────────────────────

export function useModifierWasteSignals(
  dateFrom?: string,
  dateTo?: string,
  locationId?: string,
  modifierGroupId?: string,
  limit?: number,
) {
  const [data, setData] = useState<WasteSignalRow[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const defaults = getDefaultDateRange();
  const resolvedFrom = dateFrom ?? defaults.dateFrom;
  const resolvedTo = dateTo ?? defaults.dateTo;

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const qs = buildParams({
        dateFrom: resolvedFrom,
        dateTo: resolvedTo,
        locationId,
        modifierGroupId,
        limit: limit ? String(limit) : undefined,
      });
      const res = await apiFetch<{ data: WasteSignalRow[] }>(
        `/api/v1/reports/modifiers/waste-signals?${qs}`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load waste signals'));
    } finally {
      setIsLoading(false);
    }
  }, [resolvedFrom, resolvedTo, locationId, modifierGroupId, limit]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refresh: fetchData };
}

// ── useModifierComplexity ────────────────────────────────────────

export function useModifierComplexity(
  dateFrom?: string,
  dateTo?: string,
  locationId?: string,
  limit?: number,
) {
  const [data, setData] = useState<ComplexityRow[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const defaults = getDefaultDateRange();
  const resolvedFrom = dateFrom ?? defaults.dateFrom;
  const resolvedTo = dateTo ?? defaults.dateTo;

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const qs = buildParams({
        dateFrom: resolvedFrom,
        dateTo: resolvedTo,
        locationId,
        limit: limit ? String(limit) : undefined,
      });
      const res = await apiFetch<{ data: ComplexityRow[] }>(
        `/api/v1/reports/modifiers/complexity?${qs}`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load modifier complexity'));
    } finally {
      setIsLoading(false);
    }
  }, [resolvedFrom, resolvedTo, locationId, limit]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refresh: fetchData };
}
