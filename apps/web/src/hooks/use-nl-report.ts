'use client';

import { useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';

// ── Types ──────────────────────────────────────────────────────────

export interface NLReportResult {
  title: string;
  description: string;
  fields: string[];
  filters: Record<string, unknown>[];
  chartType: string;
  sql: string | null;
}

interface NLReportApiResponse {
  data: NLReportResult;
}

// ── Hook ───────────────────────────────────────────────────────────

export function useNLReport() {
  const [report, setReport] = useState<NLReportResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildReport = useCallback(async (description: string): Promise<NLReportResult | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await apiFetch<NLReportApiResponse>('/api/v1/semantic/nl-report', {
        method: 'POST',
        body: JSON.stringify({ description }),
      });

      setReport(res.data);
      return res.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to build report from description';
      setError(msg);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setReport(null);
    setError(null);
  }, []);

  return { report, buildReport, clear, isLoading, error };
}
