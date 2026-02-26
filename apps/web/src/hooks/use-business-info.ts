'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type {
  BusinessInfoData,
  ContentBlockData,
  UpdateBusinessInfoInput,
  ContentBlockKey,
} from '@oppsera/shared';

// ── Combined fetch (single API call) ────────────────────────────

interface GeneralData {
  info: BusinessInfoData;
  blocks: ContentBlockData[];
}

export function useBusinessInfoAll() {
  return useQuery({
    queryKey: ['general-data'],
    queryFn: async () => {
      const res = await apiFetch<{ data: GeneralData }>('/api/v1/settings/general-data');
      return res.data;
    },
    staleTime: 60_000,
  });
}

// ── Legacy hooks (keep for backward compat — derive from combined) ──

export function useBusinessInfo() {
  return useQuery({
    queryKey: ['business-info'],
    queryFn: async () => {
      const res = await apiFetch<{ data: BusinessInfoData }>('/api/v1/settings/business-info');
      return res.data;
    },
    staleTime: 60_000,
  });
}

export function useContentBlocks() {
  return useQuery({
    queryKey: ['content-blocks'],
    queryFn: async () => {
      const res = await apiFetch<{ data: ContentBlockData[] }>('/api/v1/settings/content-blocks');
      return res.data;
    },
    staleTime: 60_000,
  });
}

// ── Mutations ───────────────────────────────────────────────────

export function useUpdateBusinessInfo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateBusinessInfoInput) => {
      const res = await apiFetch<{ data: BusinessInfoData }>('/api/v1/settings/business-info', {
        method: 'PATCH',
        body: JSON.stringify(input),
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['business-info'], data);
      // Also update the combined cache if it exists
      queryClient.setQueryData<GeneralData>(['general-data'], (old) =>
        old ? { ...old, info: data } : undefined,
      );
    },
  });
}

export function useUpdateContentBlock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { blockKey: ContentBlockKey; content: string }) => {
      const res = await apiFetch<{ data: ContentBlockData }>('/api/v1/settings/content-blocks', {
        method: 'PATCH',
        body: JSON.stringify(input),
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-blocks'] });
      queryClient.invalidateQueries({ queryKey: ['general-data'] });
    },
  });
}

// ── Batch content block mutation (parallel saves) ───────────────

export function useBatchUpdateContentBlocks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (inputs: { blockKey: ContentBlockKey; content: string }[]) => {
      const results = await Promise.all(
        inputs.map((input) =>
          apiFetch<{ data: ContentBlockData }>('/api/v1/settings/content-blocks', {
            method: 'PATCH',
            body: JSON.stringify(input),
          }),
        ),
      );
      return results.map((r) => r.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-blocks'] });
      queryClient.invalidateQueries({ queryKey: ['general-data'] });
    },
  });
}
