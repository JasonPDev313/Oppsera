'use client';

import { useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';

// ── Types (aligned with backend predictive-forecaster.ts) ───────

export interface HistoricalDataPoint {
  date: string;
  value: number;
}

export interface ForecastDataPoint {
  date: string;
  predicted: number;
  upperBound: number;
  lowerBound: number;
  confidence: number;
}

export interface ForecastResult {
  metric: string;
  historicalData: HistoricalDataPoint[];
  forecastData: ForecastDataPoint[];
  trend: 'up' | 'down' | 'flat';
  trendStrength: number;
  methodology: string;
}

export interface ForecastInput {
  metricSlug: string;
  forecastDays?: number;
  historyDays?: number;
  method?: 'linear' | 'moving_average' | 'exponential_smoothing';
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
