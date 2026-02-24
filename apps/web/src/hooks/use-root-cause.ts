'use client';

import { useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';

// ── Types ──────────────────────────────────────────────────────────

export interface RootCauseDriver {
  dimension: string;
  dimensionValue: string;
  impact: number;
  impactPercent: number;
  direction: 'up' | 'down';
  explanation: string;
}

export interface RootCauseComparison {
  currentValue: number;
  previousValue: number;
  absoluteChange: number;
  percentChange: number;
  currentPeriod: { start: string; end: string };
  comparisonPeriod: { start: string; end: string };
}

export interface RootCauseResult {
  metricSlug: string;
  metricDisplayName: string;
  comparison: RootCauseComparison;
  drivers: RootCauseDriver[];
  narrative: string;
  confidence: number;
  analysisDepth: number;
  tablesAccessed: string[];
}

export interface RootCauseInput {
  metricSlug: string;
  startDate: string;
  endDate: string;
  comparisonStart?: string;
  comparisonEnd?: string;
}

interface RootCauseApiResponse {
  data: RootCauseResult;
}

// ── Hook ───────────────────────────────────────────────────────────

export function useRootCause() {
  const [result, setResult] = useState<RootCauseResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = useCallback(async (input: RootCauseInput): Promise<RootCauseResult | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await apiFetch<RootCauseApiResponse>('/api/v1/semantic/root-cause', {
        method: 'POST',
        body: JSON.stringify(input),
      });

      setResult(res.data);
      return res.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to analyze root cause';
      setError(msg);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { result, analyze, isLoading, error };
}
