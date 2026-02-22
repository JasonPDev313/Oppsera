'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import type { BreakageReviewItem, BreakageReviewStats } from '@/types/accounting';

// ── useBreakageReview ───────────────────────────────────────

export interface BreakageReviewFilters {
  status?: string;
  cursor?: string;
  limit?: number;
}

export function useBreakageReview(filters: BreakageReviewFilters = {}) {
  const result = useQuery({
    queryKey: ['breakage-review', filters],
    queryFn: () => {
      const qs = buildQueryString(filters);
      return apiFetch<{
        data: BreakageReviewItem[];
        meta: { cursor: string | null; hasMore: boolean };
        stats: BreakageReviewStats;
      }>(`/api/v1/accounting/breakage${qs}`).then((r) => ({
        items: r.data,
        meta: r.meta,
        stats: r.stats,
      }));
    },
    staleTime: 30_000,
  });

  return {
    items: result.data?.items ?? [],
    meta: result.data?.meta ?? { cursor: null, hasMore: false },
    stats: result.data?.stats ?? { pendingCount: 0, pendingAmountCents: 0 },
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

// ── useBreakageMutations ────────────────────────────────────

export function useBreakageMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['breakage-review'] });
  };

  const reviewBreakage = useMutation({
    mutationFn: (input: {
      id: string;
      action: 'approve' | 'decline';
      notes?: string;
    }) =>
      apiFetch(`/api/v1/accounting/breakage/${input.id}/review`, {
        method: 'POST',
        body: JSON.stringify({ action: input.action, notes: input.notes }),
      }),
    onSuccess: () => invalidate(),
  });

  return { reviewBreakage };
}
