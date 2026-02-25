'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type {
  BusinessInfoData,
  ContentBlockData,
  UpdateBusinessInfoInput,
  ContentBlockKey,
} from '@oppsera/shared';

// ── Business Info ────────────────────────────────────────────────

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
    },
  });
}

// ── Content Blocks ───────────────────────────────────────────────

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
    },
  });
}
