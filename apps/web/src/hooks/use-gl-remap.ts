'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

// ── Types ──────────────────────────────────────────────────────

export interface MissingMapping {
  entityType: string;
  entityId: string;
  nowMapped: boolean;
}

export interface RemappableTender {
  tenderId: string;
  sourceModule: string;
  businessDate: string;
  amountCents: number;
  unmappedEventCount: number;
  missingMappings: MissingMapping[];
  canRemap: boolean;
  glJournalEntryId: string | null;
}

export interface PreviewLine {
  accountId: string;
  accountNumber: string;
  accountName: string;
  debitAmount: string;
  creditAmount: string;
  memo: string;
  isFallback: boolean;
}

export interface RemapPreview {
  tenderId: string;
  businessDate?: string;
  originalLines?: PreviewLine[];
  projectedLines?: PreviewLine[];
  hasChanges?: boolean;
  isNewPosting?: boolean;
  error?: string;
}

export interface RemapResult {
  tenderId: string;
  success: boolean;
  voidedEntryId?: string;
  newEntryId?: string;
  resolvedEventCount?: number;
  error?: string;
}

export interface RemapResponse {
  results: RemapResult[];
  summary: { total: number; success: number; failed: number };
}

// ── useRemappableTenders ───────────────────────────────────────

export function useRemappableTenders() {
  const result = useQuery({
    queryKey: ['remappable-tenders'],
    queryFn: () =>
      apiFetch<{ data: RemappableTender[] }>(
        '/api/v1/accounting/unmapped-events/remappable',
      ).then((r) => r.data),
    staleTime: 30_000,
  });

  return {
    data: result.data ?? [],
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

// ── useRemapPreview ────────────────────────────────────────────

export function useRemapPreview() {
  const mutation = useMutation({
    mutationFn: (tenderIds: string[]) =>
      apiFetch<{ data: RemapPreview[] }>(
        '/api/v1/accounting/unmapped-events/remap/preview',
        {
          method: 'POST',
          body: JSON.stringify({ tenderIds }),
        },
      ).then((r) => r.data),
  });

  return {
    preview: mutation.mutateAsync,
    data: mutation.data ?? [],
    isLoading: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}

// ── useRemapExecute ────────────────────────────────────────────

export function useRemapExecute() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (input: { tenderIds: string[]; reason?: string }) =>
      apiFetch<{ data: RemapResponse }>(
        '/api/v1/accounting/unmapped-events/remap',
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
      ).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unmapped-events'] });
      queryClient.invalidateQueries({ queryKey: ['remappable-tenders'] });
      queryClient.invalidateQueries({ queryKey: ['mapping-coverage'] });
    },
  });

  return {
    execute: mutation.mutateAsync,
    data: mutation.data ?? null,
    isLoading: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}
