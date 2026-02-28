'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type {
  FixedAssetListItem,
  FixedAssetDetail,
  DepreciationSchedule,
  AssetSummaryReport,
} from '@oppsera/module-accounting';

// ── useFixedAssets (list) ───────────────────────────────────────
export function useFixedAssets(params?: { status?: string; category?: string; locationId?: string }) {
  const result = useQuery({
    queryKey: ['fixed-assets', params],
    queryFn: () => {
      const p = new URLSearchParams();
      if (params?.status) p.set('status', params.status);
      if (params?.category) p.set('category', params.category);
      if (params?.locationId) p.set('locationId', params.locationId);
      const qs = p.toString();
      return apiFetch<{ data: FixedAssetListItem[]; meta: { cursor: string | null; hasMore: boolean } }>(
        `/api/v1/accounting/fixed-assets${qs ? `?${qs}` : ''}`,
      ).then((r) => r.data);
    },
    staleTime: 30_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useFixedAsset (single) ─────────────────────────────────────
export function useFixedAsset(assetId: string | null) {
  const result = useQuery({
    queryKey: ['fixed-asset', assetId],
    queryFn: () =>
      apiFetch<{ data: FixedAssetDetail }>(`/api/v1/accounting/fixed-assets/${assetId}`).then(
        (r) => r.data,
      ),
    enabled: !!assetId,
    staleTime: 15_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useDepreciationSchedule ────────────────────────────────────
export function useDepreciationSchedule(assetId: string | null) {
  const result = useQuery({
    queryKey: ['depreciation-schedule', assetId],
    queryFn: () =>
      apiFetch<{ data: DepreciationSchedule }>(`/api/v1/accounting/fixed-assets/${assetId}/schedule`).then(
        (r) => r.data,
      ),
    enabled: !!assetId,
    staleTime: 30_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── useAssetSummary ────────────────────────────────────────────
export function useAssetSummary(locationId?: string) {
  const result = useQuery({
    queryKey: ['asset-summary', locationId],
    queryFn: () => {
      const p = new URLSearchParams();
      if (locationId) p.set('locationId', locationId);
      const qs = p.toString();
      return apiFetch<{ data: AssetSummaryReport }>(
        `/api/v1/accounting/reports/fixed-asset-summary${qs ? `?${qs}` : ''}`,
      ).then((r) => r.data);
    },
    staleTime: 30_000,
  });

  return {
    data: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.refetch,
  };
}

// ── Fixed asset mutations ──────────────────────────────────────
export function useFixedAssetMutations() {
  const qc = useQueryClient();

  const createAsset = useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      apiFetch('/api/v1/accounting/fixed-assets', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fixed-assets'] });
    },
  });

  const updateAsset = useMutation({
    mutationFn: ({ assetId, ...input }: { assetId: string } & Record<string, unknown>) =>
      apiFetch(`/api/v1/accounting/fixed-assets/${assetId}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fixed-assets'] });
      qc.invalidateQueries({ queryKey: ['fixed-asset'] });
    },
  });

  const recordDepreciation = useMutation({
    mutationFn: ({ assetId, ...input }: { assetId: string } & Record<string, unknown>) =>
      apiFetch(`/api/v1/accounting/fixed-assets/${assetId}/depreciate`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fixed-assets'] });
      qc.invalidateQueries({ queryKey: ['fixed-asset'] });
      qc.invalidateQueries({ queryKey: ['depreciation-schedule'] });
      qc.invalidateQueries({ queryKey: ['asset-summary'] });
    },
  });

  const disposeAsset = useMutation({
    mutationFn: ({ assetId, ...input }: { assetId: string } & Record<string, unknown>) =>
      apiFetch(`/api/v1/accounting/fixed-assets/${assetId}/dispose`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fixed-assets'] });
      qc.invalidateQueries({ queryKey: ['fixed-asset'] });
      qc.invalidateQueries({ queryKey: ['asset-summary'] });
    },
  });

  const depreciateAll = useMutation({
    mutationFn: (input?: Record<string, unknown>) =>
      apiFetch('/api/v1/accounting/fixed-assets/depreciate-all', { method: 'POST', body: input ? JSON.stringify(input) : undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fixed-assets'] });
      qc.invalidateQueries({ queryKey: ['fixed-asset'] });
      qc.invalidateQueries({ queryKey: ['depreciation-schedule'] });
      qc.invalidateQueries({ queryKey: ['asset-summary'] });
    },
  });

  return { createAsset, updateAsset, recordDepreciation, disposeAsset, depreciateAll };
}
