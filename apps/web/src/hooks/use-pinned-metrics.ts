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

interface MetricsQueryResponse {
  data: Record<string, {
    values: number[];
    dates: string[];
    current: number | null;
    previous: number | null;
    changePercent: number | null;
  }>;
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

  // ── Fetch sparkline data for all pinned metrics in a single request ──
  useEffect(() => {
    if (metrics.length === 0) return;

    const controller = new AbortController();

    async function enrichWithSparklines() {
      const today = new Date();
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const startDate = sevenDaysAgo.toISOString().split('T')[0];
      const endDate = today.toISOString().split('T')[0];

      try {
        const slugs = metrics.map((m) => m.metricSlug);
        const res = await apiFetch<MetricsQueryResponse>('/api/v1/semantic/metrics-query', {
          method: 'POST',
          body: JSON.stringify({ slugs, startDate, endDate }),
          signal: controller.signal,
        });

        const enriched = metrics.map((metric) => {
          const data = res.data[metric.metricSlug];
          if (!data) return metric;

          return {
            ...metric,
            sparklineValues: data.values,
            currentValue: data.current,
            previousValue: data.previous,
            changePercent: data.changePercent,
          };
        });

        if (!controller.signal.aborted && mountedRef.current) {
          setMetrics(enriched);
        }
      } catch {
        // Sparkline enrichment is best-effort — never block on failure
      }
    }

    enrichWithSparklines();
    return () => { controller.abort(); };
    // Only re-run when metric IDs change, not when sparklines are enriched
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
