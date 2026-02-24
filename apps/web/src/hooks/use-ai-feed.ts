'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';

// ── Types ─────────────────────────────────────────────────────────

export type KpiTrend = 'up' | 'down' | 'flat';

export interface KpiCard {
  metricSlug: string;
  label: string;
  value: number;
  formattedValue: string;
  format: 'currency' | 'number' | 'percentage' | 'duration';
  /** Change compared to prior period */
  change: number;
  changePct: number;
  formattedChange: string;
  trend: KpiTrend;
  /** Whether higher is better for this metric */
  higherIsBetter: boolean;
  /** Sparkline data points (last 7 or 30 values) */
  sparkline: number[] | null;
  /** Period label (e.g., "Today", "This Week") */
  periodLabel: string;
}

export interface FeedSuggestion {
  text: string;
  /** Category hint for styling */
  category: 'performance' | 'opportunity' | 'risk' | 'trend' | 'general';
  /** Priority for ordering (lower = more important) */
  priority: number;
}

export interface RecentFinding {
  id: string;
  title: string;
  summary: string;
  severity: 'info' | 'warning' | 'critical' | 'positive';
  metricSlug: string | null;
  createdAt: string;
}

export interface DigestSummary {
  id: string;
  digestName: string;
  periodLabel: string;
  /** Short summary of the digest content */
  headline: string;
  generatedAt: string;
}

export interface InsightFeed {
  /** Personalized greeting based on time of day and user activity */
  greeting: string;
  /** Top KPI cards for the user's pinned/default metrics */
  kpis: KpiCard[];
  /** AI-generated suggested questions based on current data */
  suggestions: FeedSuggestion[];
  /** Recent proactive findings from background analysis */
  recentFindings: RecentFinding[];
  /** Latest digest summary (if any digests are configured) */
  digest: DigestSummary | null;
  /** Timestamp when this feed was generated */
  generatedAt: string;
}

// ── useInsightFeed ────────────────────────────────────────────────

interface UseInsightFeedOptions {
  /** Lens to scope the feed to */
  lensSlug?: string;
  /** Location ID to scope the feed to */
  locationId?: string;
  /** Number of KPIs to include (default server-side, typically 4-6) */
  kpiLimit?: number;
  /** Auto-refresh interval in milliseconds (0 = disabled) */
  autoRefreshMs?: number;
}

export function useInsightFeed(opts: UseInsightFeedOptions = {}) {
  const [feed, setFeed] = useState<InsightFeed | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFeed = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const qs = buildQueryString({
        lensSlug: opts.lensSlug,
        locationId: opts.locationId,
        kpiLimit: opts.kpiLimit,
        timezone: typeof Intl !== 'undefined'
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : undefined,
      });
      const res = await apiFetch<{ data: InsightFeed }>(
        `/api/v1/semantic/feed${qs}`,
      );
      setFeed(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load insight feed');
    } finally {
      setIsLoading(false);
    }
  }, [opts.lensSlug, opts.locationId, opts.kpiLimit]);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  // Optional auto-refresh
  useEffect(() => {
    if (!opts.autoRefreshMs || opts.autoRefreshMs <= 0) return;

    const interval = setInterval(() => {
      fetchFeed();
    }, opts.autoRefreshMs);

    return () => clearInterval(interval);
  }, [fetchFeed, opts.autoRefreshMs]);

  return { feed, isLoading, error, refresh: fetchFeed };
}
