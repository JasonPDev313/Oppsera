'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';

// ── Types ──────────────────────────────────────────────────────────

export interface PinnedMetric {
  id: string;
  metricSlug: string;
  displayName: string;
  sortOrder: number;
  config: PinnedMetricConfig | null;
  createdAt: string;
  updatedAt: string;
  // Client-enriched fields (populated by sparkline fetch)
  sparklineValues?: number[];
  currentValue?: number | null;
  previousValue?: number | null;
  changePercent?: number | null;
}

export interface PinnedMetricConfig {
  format?: 'currency' | 'number' | 'percent';
  thresholdHigh?: number;
  thresholdLow?: number;
  comparisonDays?: number;
}

export interface PinMetricInput {
  metricSlug: string;
  displayName: string;
  config?: PinnedMetricConfig;
}

interface PinnedMetricsListResponse {
  data: PinnedMetric[];
}

interface PinMetricResponse {
  data: PinnedMetric;
}

interface SparklineRow {
  [key: string]: unknown;
}

// ── Hook ───────────────────────────────────────────────────────────

export function usePinnedMetrics() {
  const [metrics, setMetrics] = useState<PinnedMetric[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  // ── Fetch pinned metrics list ──
  const fetchMetrics = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch<PinnedMetricsListResponse>('/api/v1/semantic/pinned-metrics');
      if (!mountedRef.current) return;
      setMetrics(res.data);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load pinned metrics');
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  // ── Auto-load on mount ──
  useEffect(() => {
    mountedRef.current = true;
    fetchMetrics();
    return () => { mountedRef.current = false; };
  }, [fetchMetrics]);

  // ── Fetch sparkline data for each pinned metric (last 7 days) ──
  useEffect(() => {
    if (metrics.length === 0) return;

    let cancelled = false;

    async function enrichWithSparklines() {
      const today = new Date();
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const startDate = sevenDaysAgo.toISOString().split('T')[0];
      const endDate = today.toISOString().split('T')[0];

      const enriched = await Promise.all(
        metrics.map(async (metric) => {
          try {
            const res = await apiFetch<{
              data: { rows: SparklineRow[]; rowCount: number };
            }>('/api/v1/semantic/query', {
              method: 'POST',
              body: JSON.stringify({
                metrics: [metric.metricSlug],
                dimensions: ['date'],
                dateRange: { start: startDate, end: endDate },
                sort: [{ metricSlug: 'date', direction: 'asc' }],
                limit: 7,
              }),
            });

            const rows = res.data.rows ?? [];
            const values = rows
              .map((row) => {
                const val = row[metric.metricSlug];
                return typeof val === 'number' ? val : Number(val);
              })
              .filter((v) => !isNaN(v));

            const currentValue = values.length > 0 ? values[values.length - 1]! : null;
            const previousValue = values.length > 1 ? values[0]! : null;
            const changePercent =
              currentValue != null && previousValue != null && previousValue !== 0
                ? ((currentValue - previousValue) / Math.abs(previousValue)) * 100
                : null;

            return {
              ...metric,
              sparklineValues: values,
              currentValue,
              previousValue,
              changePercent,
            };
          } catch {
            // Sparkline enrichment is best-effort — never block on failure
            return metric;
          }
        }),
      );

      if (!cancelled && mountedRef.current) {
        setMetrics(enriched);
      }
    }

    enrichWithSparklines();
    return () => { cancelled = true; };
    // Only re-run when metric IDs change, not when sparklines are enriched
  }, [metrics.map((m) => m.id).join(',')]);

  // ── Pin a new metric ──
  const pin = useCallback(async (input: PinMetricInput): Promise<PinnedMetric | null> => {
    try {
      const res = await apiFetch<PinMetricResponse>('/api/v1/semantic/pinned-metrics', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      // Optimistic: append and re-fetch for proper ordering
      setMetrics((prev) => [...prev, res.data]);
      return res.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to pin metric';
      setError(msg);
      throw err;
    }
  }, []);

  // ── Unpin a metric ──
  const unpin = useCallback(async (id: string): Promise<void> => {
    // Optimistic removal
    setMetrics((prev) => prev.filter((m) => m.id !== id));

    try {
      await apiFetch(`/api/v1/semantic/pinned-metrics/${id}`, {
        method: 'DELETE',
      });
    } catch (err) {
      // Revert optimistic removal by re-fetching
      const msg = err instanceof Error ? err.message : 'Failed to unpin metric';
      setError(msg);
      fetchMetrics();
      throw err;
    }
  }, [fetchMetrics]);

  // ── Reorder pinned metrics ──
  const reorder = useCallback(async (orderedIds: string[]): Promise<void> => {
    // Optimistic reorder
    setMetrics((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]));
      return orderedIds
        .map((id, idx) => {
          const m = byId.get(id);
          return m ? { ...m, sortOrder: idx } : null;
        })
        .filter((m): m is PinnedMetric => m !== null);
    });

    try {
      await apiFetch('/api/v1/semantic/pinned-metrics/reorder', {
        method: 'PATCH',
        body: JSON.stringify({ orderedIds }),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to reorder metrics';
      setError(msg);
      fetchMetrics();
      throw err;
    }
  }, [fetchMetrics]);

  return { metrics, pin, unpin, reorder, isLoading, error, refresh: fetchMetrics };
}
