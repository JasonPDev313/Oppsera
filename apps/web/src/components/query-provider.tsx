'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
} from '@tanstack/react-query';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,          // 1 minute (was 30s — reduces refetch frequency)
        gcTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false, // disabled globally — we handle this manually below
        retry: 1,
      },
    },
  });
}

/**
 * Throttled window-focus refetch.
 *
 * Instead of React Query's default behavior (refetch ALL stale queries the
 * instant the tab regains focus), we use a manual approach:
 * - Ignore focus events within 2 minutes of the last refetch
 * - When we do refetch, use `invalidateQueries` which respects staleTime
 *   and only refetches queries that are actually stale + actively rendered
 *
 * This prevents the "thundering herd" of 20-50+ simultaneous requests that
 * saturates the browser connection pool when returning from a long idle.
 */
const FOCUS_THROTTLE_MS = 2 * 60 * 1000; // ignore re-focus within 2 minutes

function useThrottledFocusRefetch(queryClient: QueryClient) {
  const lastRefetchRef = useRef(0);

  const handleFocus = useCallback(() => {
    const now = Date.now();
    if (now - lastRefetchRef.current < FOCUS_THROTTLE_MS) return;
    lastRefetchRef.current = now;

    // invalidateQueries only marks queries stale — React Query then refetches
    // only the ones that are actively observed (mounted). This is much gentler
    // than refetchOnWindowFocus which refetches everything in the cache.
    queryClient.invalidateQueries();
  }, [queryClient]);

  useEffect(() => {
    // Tell React Query we handle focus ourselves
    focusManager.setEventListener(() => {
      const onVisibilityChange = () => {
        if (!document.hidden) handleFocus();
      };
      document.addEventListener('visibilitychange', onVisibilityChange);
      return () => {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      };
    });

    return () => {
      // Reset to default focus manager on unmount
      focusManager.setEventListener(undefined as unknown as Parameters<typeof focusManager.setEventListener>[0]);
    };
  }, [handleFocus]);
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  useThrottledFocusRefetch(queryClient);
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
