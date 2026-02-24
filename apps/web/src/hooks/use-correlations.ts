'use client';

import { useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';

// ── Types ──────────────────────────────────────────────────────────

export interface CorrelationPair {
  metricSlug: string;
  metricDisplayName: string;
  correlationCoefficient: number;
  strength: 'strong' | 'moderate' | 'weak' | 'none';
  direction: 'positive' | 'negative';
  lagDays: number;
  sampleSize: number;
  pValue: number | null;
  explanation: string;
}

export interface CorrelationResult {
  targetMetricSlug: string;
  targetMetricDisplayName: string;
  periodDays: number;
  correlations: CorrelationPair[];
  narrative: string;
  dataPointsAnalyzed: number;
}

export interface CorrelationInput {
  targetMetricSlug: string;
  days?: number;
}

interface CorrelationApiResponse {
  data: CorrelationResult;
}

// ── Hook ───────────────────────────────────────────────────────────

export function useCorrelations() {
  const [result, setResult] = useState<CorrelationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const discover = useCallback(async (input: CorrelationInput): Promise<CorrelationResult | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await apiFetch<CorrelationApiResponse>('/api/v1/semantic/correlations', {
        method: 'POST',
        body: JSON.stringify(input),
      });

      setResult(res.data);
      return res.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to discover correlations';
      setError(msg);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { result, discover, isLoading, error };
}
