'use client';

import { useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';

// ── Types ──────────────────────────────────────────────────────────

export interface ForecastDataPoint {
  date: string;
  value: number;
  lowerBound: number;
  upperBound: number;
  isActual: boolean;
}

export interface ForecastSeasonality {
  type: 'daily' | 'weekly' | 'monthly' | 'yearly';
  strength: number;
  description: string;
}

export interface ForecastResult {
  metricSlug: string;
  metricDisplayName: string;
  horizonDays: number;
  method: string;
  dataPoints: ForecastDataPoint[];
  trend: 'increasing' | 'decreasing' | 'stable' | 'volatile';
  trendStrength: number;
  seasonality: ForecastSeasonality[];
  confidenceLevel: number;
  mape: number | null;
  narrative: string;
}

export interface ForecastInput {
  metricSlug: string;
  horizonDays?: number;
  confidenceLevel?: number;
  includeSeasonality?: boolean;
}

interface ForecastApiResponse {
  data: ForecastResult;
}

// ── Hook ───────────────────────────────────────────────────────────

export function useForecast() {
  const [result, setResult] = useState<ForecastResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (input: ForecastInput): Promise<ForecastResult | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await apiFetch<ForecastApiResponse>('/api/v1/semantic/forecast', {
        method: 'POST',
        body: JSON.stringify(input),
      });

      setResult(res.data);
      return res.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate forecast';
      setError(msg);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { result, generate, isLoading, error };
}
