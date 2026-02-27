'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';

export interface GlCodeSummaryLine {
  section: 'revenue' | 'tender' | 'tax' | 'tip' | 'discount' | 'expense' | 'other';
  memo: string;
  accountNumber: string;
  accountName: string;
  accountDisplay: string;
  totalDebit: number;
  totalCredit: number;
}

interface GlCodeSummaryResponse {
  data: {
    lines: GlCodeSummaryLine[];
    grandTotalDebit: number;
    grandTotalCredit: number;
  };
}

export interface GlCodeSummaryParams {
  startDate: string;
  endDate: string;
  locationId?: string;
}

export function useGlCodeSummary(params: GlCodeSummaryParams) {
  const result = useQuery({
    queryKey: ['gl-code-summary', params],
    queryFn: () => {
      const qs = buildQueryString(params);
      return apiFetch<GlCodeSummaryResponse>(
        `/api/v1/accounting/reports/gl-code-summary${qs}`,
      ).then((r) => r.data);
    },
    enabled: !!params.startDate && !!params.endDate,
    staleTime: 30_000,
  });

  return {
    data: result.data ?? { lines: [], grandTotalDebit: 0, grandTotalCredit: 0 },
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}
