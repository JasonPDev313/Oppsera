'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import type { TaxRemittanceReport } from '@/types/accounting';

interface UseTaxRemittanceOptions {
  dateFrom: string;
  dateTo: string;
  locationId?: string;
}

export function useTaxRemittance(options: UseTaxRemittanceOptions) {
  const [data, setData] = useState<TaxRemittanceReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!options.dateFrom || !options.dateTo) return;

    setIsLoading(true);
    setError(null);
    try {
      const qs = buildQueryString({
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
        locationId: options.locationId,
      });
      const res = await apiFetch<{ data: TaxRemittanceReport }>(
        `/api/v1/reports/tax-remittance${qs}`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tax remittance report');
    } finally {
      setIsLoading(false);
    }
  }, [options.dateFrom, options.dateTo, options.locationId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, isLoading, error, refresh: fetch };
}

export function useTaxRemittanceExport() {
  const [isExporting, setIsExporting] = useState(false);

  const exportCsv = useCallback(
    async (options: { dateFrom: string; dateTo: string; locationId?: string }) => {
      setIsExporting(true);
      try {
        const qs = buildQueryString({
          dateFrom: options.dateFrom,
          dateTo: options.dateTo,
          locationId: options.locationId,
        });
        const res = await fetch(`/api/v1/reports/tax-remittance/export${qs}`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Export failed');

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tax-remittance-${options.dateFrom}-to-${options.dateTo}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } finally {
        setIsExporting(false);
      }
    },
    [],
  );

  return { exportCsv, isExporting };
}
