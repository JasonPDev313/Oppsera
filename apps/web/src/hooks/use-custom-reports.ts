'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useMutation } from '@/hooks/use-mutation';
import { downloadCsvExport } from '@/hooks/use-reports';
import type { SavedReport, RunReportResult, ReportFilter } from '@/types/custom-reports';

// ── List Reports (with cursor pagination) ────────────────────
interface UseCustomReportsOptions {
  limit?: number;
}

export function useCustomReports(options: UseCustomReportsOptions = {}) {
  const [items, setItems] = useState<SavedReport[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchReports = useCallback(async (loadMore = false) => {
    try {
      if (!loadMore) setIsLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (options.limit) params.set('limit', String(options.limit));
      if (loadMore && cursor) params.set('cursor', cursor);

      const res = await apiFetch<{
        data: SavedReport[];
        meta: { cursor: string | null; hasMore: boolean };
      }>(`/api/v1/reports/custom?${params.toString()}`);

      if (loadMore) {
        setItems((prev) => [...prev, ...res.data]);
      } else {
        setItems(res.data);
      }
      setCursor(res.meta.cursor);
      setHasMore(res.meta.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load reports'));
    } finally {
      setIsLoading(false);
    }
  }, [options.limit, cursor]);

  useEffect(() => {
    fetchReports();
  }, []);

  return {
    items,
    isLoading,
    error,
    hasMore,
    loadMore: () => fetchReports(true),
    mutate: () => fetchReports(false),
  };
}

// ── Single Report ─────────────────────────────────────────────
export function useCustomReport(reportId: string | undefined) {
  const [data, setData] = useState<SavedReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchReport = useCallback(async () => {
    if (!reportId) {
      setData(null);
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiFetch<{ data: SavedReport }>(
        `/api/v1/reports/custom/${reportId}`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load report'));
    } finally {
      setIsLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  return { data, isLoading, error, mutate: fetchReport };
}

// ── Save Report (create or update) ──────────────────────────
interface SaveReportInput {
  id?: string;
  name: string;
  description?: string;
  dataset: string;
  definition: {
    columns: string[];
    filters: ReportFilter[];
    sortBy?: { fieldKey: string; direction: 'asc' | 'desc' }[];
    groupBy?: string[];
    limit?: number;
  };
}

export function useSaveReport() {
  return useMutation<SaveReportInput, SavedReport>(async (input) => {
    const method = input.id ? 'PUT' : 'POST';
    const path = input.id
      ? `/api/v1/reports/custom/${input.id}`
      : '/api/v1/reports/custom';

    const res = await apiFetch<{ data: SavedReport }>(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return res.data;
  });
}

// ── Delete Report ────────────────────────────────────────────
export function useDeleteReport() {
  return useMutation<string, void>(async (reportId) => {
    await apiFetch(`/api/v1/reports/custom/${reportId}`, { method: 'DELETE' });
  });
}

// ── Run Report ───────────────────────────────────────────────
interface RunReportInput {
  reportId: string;
  overrides?: { filters?: ReportFilter[] };
}

export function useRunReport() {
  return useMutation<RunReportInput, RunReportResult>(async (input) => {
    const res = await apiFetch<{ data: RunReportResult }>(
      `/api/v1/reports/custom/${input.reportId}/run`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides: input.overrides }),
      },
    );
    return res.data;
  });
}

// ── Preview Report (no save required) ────────────────────
interface PreviewReportInput {
  dataset: string;
  definition: {
    datasets?: string[];
    columns: string[];
    filters: ReportFilter[];
    sortBy?: { fieldKey: string; direction: 'asc' | 'desc' }[];
    groupBy?: string[];
    limit?: number;
  };
}

export function usePreviewReport() {
  return useMutation<PreviewReportInput, RunReportResult>(async (input) => {
    const res = await apiFetch<{ data: RunReportResult }>(
      '/api/v1/reports/custom/preview',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
    );
    return res.data;
  });
}

// ── Export Report CSV ────────────────────────────────────────
export async function downloadCustomReportExport(reportId: string) {
  await downloadCsvExport(`/api/v1/reports/custom/${reportId}/export`, {});
}
