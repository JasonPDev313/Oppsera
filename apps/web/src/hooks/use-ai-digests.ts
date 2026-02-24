'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';

// ── Types ─────────────────────────────────────────────────────────

export type DigestFrequency = 'daily' | 'weekly' | 'monthly';
export type DigestDeliveryChannel = 'in_app' | 'email';

export interface DigestMetricConfig {
  metricSlug: string;
  /** Include comparison to prior period */
  includeComparison: boolean;
  /** Include sparkline/trend data */
  includeTrend: boolean;
}

export interface DigestSection {
  type: 'kpi_summary' | 'top_movers' | 'anomalies' | 'goal_pacing' | 'recommendations' | 'custom_metrics';
  enabled: boolean;
  /** Section-specific config (e.g., number of top movers to show) */
  config: Record<string, unknown>;
}

export interface InsightDigest {
  id: string;
  name: string;
  description: string | null;
  frequency: DigestFrequency;
  /** Time of day to generate (HH:mm format, e.g., "08:00") */
  scheduledTime: string;
  /** Day of week for weekly digests (0=Sunday, 1=Monday, etc.) */
  scheduledDayOfWeek: number | null;
  /** Day of month for monthly digests (1-28) */
  scheduledDayOfMonth: number | null;
  timezone: string;
  deliveryChannels: DigestDeliveryChannel[];
  /** Specific metrics to include in the digest */
  metrics: DigestMetricConfig[];
  sections: DigestSection[];
  dimensionFilters: Record<string, string> | null;
  lensSlug: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastGeneratedAt: string | null;
  lastDeliveredAt: string | null;
}

export interface DigestDetail {
  id: string;
  digestId: string;
  digestName: string;
  /** ISO date string for the period this digest covers */
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  /** The rendered narrative content (markdown) */
  content: string;
  /** Structured data sections */
  sections: DigestRenderedSection[];
  /** Metrics snapshot at generation time */
  metricsSnapshot: Record<string, unknown>;
}

export interface DigestRenderedSection {
  type: string;
  title: string;
  content: string;
  data: Record<string, unknown> | null;
}

export interface CreateDigestInput {
  name: string;
  description?: string;
  frequency: DigestFrequency;
  scheduledTime: string;
  scheduledDayOfWeek?: number;
  scheduledDayOfMonth?: number;
  timezone?: string;
  deliveryChannels: DigestDeliveryChannel[];
  metrics?: DigestMetricConfig[];
  sections?: DigestSection[];
  dimensionFilters?: Record<string, string>;
  lensSlug?: string;
}

export interface UpdateDigestInput {
  name?: string;
  description?: string;
  frequency?: DigestFrequency;
  scheduledTime?: string;
  scheduledDayOfWeek?: number;
  scheduledDayOfMonth?: number;
  timezone?: string;
  deliveryChannels?: DigestDeliveryChannel[];
  metrics?: DigestMetricConfig[];
  sections?: DigestSection[];
  dimensionFilters?: Record<string, string>;
  lensSlug?: string;
  isActive?: boolean;
}

// ── useInsightDigests ─────────────────────────────────────────────

export function useInsightDigests() {
  const [digests, setDigests] = useState<InsightDigest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDigests = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: InsightDigest[] }>(
        '/api/v1/semantic/digests',
      );
      setDigests(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load digests');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDigests();
  }, [fetchDigests]);

  const createDigest = useCallback(async (input: CreateDigestInput): Promise<InsightDigest | null> => {
    try {
      const res = await apiFetch<{ data: InsightDigest }>(
        '/api/v1/semantic/digests',
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
      );
      await fetchDigests();
      return res.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create digest');
      return null;
    }
  }, [fetchDigests]);

  const updateDigest = useCallback(async (digestId: string, input: UpdateDigestInput): Promise<InsightDigest | null> => {
    try {
      const res = await apiFetch<{ data: InsightDigest }>(
        `/api/v1/semantic/digests/${digestId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(input),
        },
      );
      await fetchDigests();
      return res.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update digest');
      return null;
    }
  }, [fetchDigests]);

  const deleteDigest = useCallback(async (digestId: string): Promise<boolean> => {
    try {
      await apiFetch(`/api/v1/semantic/digests/${digestId}`, {
        method: 'DELETE',
      });
      await fetchDigests();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete digest');
      return false;
    }
  }, [fetchDigests]);

  return { digests, isLoading, error, createDigest, updateDigest, deleteDigest, refresh: fetchDigests };
}

// ── useDigestDetail ───────────────────────────────────────────────

export function useDigestDetail(id: string) {
  const [digest, setDigest] = useState<DigestDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!id) {
      setDigest(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: DigestDetail }>(
        `/api/v1/semantic/digests/${id}/latest`,
      );
      setDigest(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load digest detail');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  return { digest, isLoading, error, refresh: fetchDetail };
}
