'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

// ── Types ────────────────────────────────────────────────────

interface GlReadinessData {
  isFullyCovered: boolean;
  totalTenders: number;
  tendersWithoutGl: number;
  unmappedEventCount: number;
  autoResolvableCount: number;
  status: 'ready' | 'needs_backfill' | 'needs_review';
}

interface BackfillData {
  posted: number;
  skipped: number;
  errors: number;
  totalUnposted: number;
  lastProcessedTenderId: string | null;
  hasMore: boolean;
  failedTenders: Array<{ tenderId: string; orderId: string; message: string }>;
}

interface BackfillResult {
  backfill: BackfillData;
  autoResolved: { applied: number; remaining: number };
  isFullyCovered: boolean;
}

/** Cumulative progress across multi-batch backfill */
export interface BackfillProgress {
  totalUnposted: number;
  processedSoFar: number;
  currentBatch: number;
  errors: number;
}

export type GlReadinessStatus =
  | 'loading'
  | 'ready'
  | 'syncing'
  | 'needs_review'
  | 'error'
  | 'dismissed';

const SESSION_KEY = 'gl_readiness_status';
const DISMISS_KEY = 'gl_readiness_dismissed';
const BROADCAST_CHANNEL = 'gl-readiness-invalidation';

// ── BroadcastChannel for cross-tab invalidation (Fix 5) ─────

let _broadcastChannel: BroadcastChannel | null = null;

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined') return null;
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!_broadcastChannel) {
    try {
      _broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL);
    } catch {
      // BroadcastChannel not supported (e.g., SSR, some mobile browsers)
      return null;
    }
  }
  return _broadcastChannel;
}

// ── Hook ─────────────────────────────────────────────────────

export function useGlReadiness() {
  const queryClient = useQueryClient();
  const [backfillResult, setBackfillResult] = useState<BackfillResult | null>(null);
  const [progress, setProgress] = useState<BackfillProgress | null>(null);
  const autoTriggered = useRef(false);
  const cursorRef = useRef<string | null>(null);
  const cumulativeRef = useRef({ posted: 0, skipped: 0, errors: 0, batch: 0 });

  // Check if dismissed this session
  const isDismissed =
    typeof window !== 'undefined' &&
    sessionStorage.getItem(DISMISS_KEY) === 'true';

  // Cross-tab invalidation listener (Fix 5)
  useEffect(() => {
    const channel = getBroadcastChannel();
    if (!channel) return;

    const handler = () => {
      // Another tab completed backfill or saved mappings — invalidate our cache
      queryClient.invalidateQueries({ queryKey: ['gl-readiness'] });
      queryClient.invalidateQueries({ queryKey: ['mapping-coverage'] });
      queryClient.invalidateQueries({ queryKey: ['unmapped-events'] });
    };

    channel.addEventListener('message', handler);
    return () => channel.removeEventListener('message', handler);
  }, [queryClient]);

  // Readiness check query (cached 5 min)
  const readiness = useQuery({
    queryKey: ['gl-readiness'],
    queryFn: () =>
      apiFetch<{ data: GlReadinessData }>('/api/v1/accounting/gl-readiness').then(
        (r) => r.data,
      ),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    // Don't fetch if we already know it's ready or dismissed
    enabled: !isDismissed,
  });

  // Invalidate caches and broadcast to other tabs
  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['accounting-health-summary'] });
    queryClient.invalidateQueries({ queryKey: ['mapping-coverage'] });
    queryClient.invalidateQueries({ queryKey: ['unmapped-events'] });
    queryClient.invalidateQueries({ queryKey: ['smart-resolution-suggestions'] });
    queryClient.invalidateQueries({ queryKey: ['gl-readiness'] });
    queryClient.invalidateQueries({ queryKey: ['trial-balance'] });
    queryClient.invalidateQueries({ queryKey: ['gl-detail'] });
    queryClient.invalidateQueries({ queryKey: ['profit-loss'] });
    queryClient.invalidateQueries({ queryKey: ['balance-sheet'] });
    queryClient.invalidateQueries({ queryKey: ['cash-flow'] });

    // Broadcast to other tabs (Fix 5)
    getBroadcastChannel()?.postMessage('invalidate');
  }, [queryClient]);

  // Single-batch backfill call
  const runBatch = useCallback(
    async (afterTenderId?: string): Promise<BackfillResult> => {
      const result = await apiFetch<{ data: BackfillResult }>(
        '/api/v1/accounting/gl-readiness/backfill',
        {
          method: 'POST',
          body: afterTenderId ? JSON.stringify({ afterTenderId }) : undefined,
        },
      );
      return result.data;
    },
    [],
  );

  // Multi-batch backfill orchestration (Fix 1 + Fix 3)
  const backfill = useMutation({
    mutationFn: async () => {
      cursorRef.current = null;
      cumulativeRef.current = { posted: 0, skipped: 0, errors: 0, batch: 0 };
      let lastResult: BackfillResult | null = null;

      // Loop batches until done or rate-limited
      while (true) {
        const result = await runBatch(cursorRef.current ?? undefined);
        lastResult = result;

        const b = result.backfill;
        const c = cumulativeRef.current;
        c.posted += b.posted;
        c.skipped += b.skipped;
        c.errors += b.errors;
        c.batch += 1;

        // Update progress state for UI
        setProgress({
          totalUnposted: b.totalUnposted,
          processedSoFar: c.posted + c.skipped + c.errors,
          currentBatch: c.batch,
          errors: c.errors,
        });

        if (!b.hasMore || !b.lastProcessedTenderId) break;
        cursorRef.current = b.lastProcessedTenderId;
      }

      // Replace individual batch stats with cumulative totals
      if (lastResult) {
        lastResult = {
          ...lastResult,
          backfill: {
            ...lastResult.backfill,
            posted: cumulativeRef.current.posted,
            skipped: cumulativeRef.current.skipped,
            errors: cumulativeRef.current.errors,
          },
        };
      }

      return lastResult!;
    },
    onSuccess: (result) => {
      setBackfillResult(result);
      setProgress(null);
      invalidateAll();

      // Cache the result in sessionStorage
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(
          SESSION_KEY,
          JSON.stringify({
            isFullyCovered: result.isFullyCovered,
            posted: result.backfill.posted,
            autoResolved: result.autoResolved.applied,
            remaining: result.autoResolved.remaining,
            ts: Date.now(),
          }),
        );
      }
    },
    onError: () => {
      setProgress(null);
    },
  });

  // Auto-trigger backfill when gaps detected (only once per mount)
  useEffect(() => {
    if (
      readiness.data &&
      readiness.data.status === 'needs_backfill' &&
      !autoTriggered.current &&
      !backfill.isPending &&
      !isDismissed
    ) {
      autoTriggered.current = true;
      backfill.mutate();
    }
  }, [readiness.data, backfill.isPending, isDismissed]);

  // Compute status
  let status: GlReadinessStatus = 'loading';

  if (isDismissed) {
    status = 'dismissed';
  } else if (readiness.isLoading) {
    status = 'loading';
  } else if (readiness.error) {
    status = 'error';
  } else if (backfill.isPending) {
    status = 'syncing';
  } else if (backfill.isError) {
    status = 'error';
  } else if (backfillResult) {
    // Backfill completed — check result
    if (backfillResult.isFullyCovered) {
      status = 'ready';
    } else if (backfillResult.autoResolved.remaining > 0) {
      status = 'needs_review';
    } else {
      status = 'ready';
    }
  } else if (readiness.data) {
    // No backfill ran — use readiness check result
    if (readiness.data.status === 'ready') {
      status = 'ready';
    } else if (readiness.data.status === 'needs_review') {
      status = 'needs_review';
    }
    // 'needs_backfill' is handled by auto-trigger above → becomes 'syncing'
  }

  const dismiss = useCallback(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(DISMISS_KEY, 'true');
    }
  }, []);

  const triggerBackfill = useCallback(() => {
    backfill.mutate();
  }, [backfill]);

  return {
    status,
    gaps: readiness.data ?? null,
    backfillResult,
    progress,
    triggerBackfill,
    dismiss,
    isBackfilling: backfill.isPending,
    /** Call from mapping save hooks to invalidate across tabs */
    invalidateAll,
  };
}
