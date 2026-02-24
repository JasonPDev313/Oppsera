'use client';

import { useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';

// ── Types ──────────────────────────────────────────────────────────

export interface DataQualityFactor {
  name: string;
  score: number;
  weight: number;
  detail: string;
}

export interface DataQualityResult {
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  score: number;
  factors: DataQualityFactor[];
}

export interface DataQualityInput {
  rowCount: number;
  executionTimeMs: number;
  dateRange?: { start: string; end: string };
  compiledSql?: string;
  compilationErrors?: string[];
  llmConfidence?: number;
  schemaTablesUsed?: string[];
  totalRowsInTable?: number;
  timedOut?: boolean;
}

interface DataQualityApiResponse {
  data: DataQualityResult;
}

// ── Hook ───────────────────────────────────────────────────────────

export function useDataQuality() {
  const [quality, setQuality] = useState<DataQualityResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkQuality = useCallback(async (input: DataQualityInput): Promise<DataQualityResult | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await apiFetch<DataQualityApiResponse>('/api/v1/semantic/data-quality', {
        method: 'POST',
        body: JSON.stringify(input),
      });

      setQuality(res.data);
      return res.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to check data quality';
      setError(msg);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setQuality(null);
    setError(null);
  }, []);

  return { quality, checkQuality, clear, isLoading, error };
}
