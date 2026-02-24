'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { apiFetch } from '@/lib/api-client';

export interface ImportProgress {
  id: string;
  status: string;
  totalRows: number;
  processedRows: number;
  importedRows: number;
  skippedRows: number;
  errorRows: number;
  quarantinedRows: number;
  startedAt: string | null;
  completedAt: string | null;
  percentage: number;
  elapsedMs: number;
  isComplete: boolean;
}

interface UseImportProgressOptions {
  /** Polling interval in ms (default 2000) */
  interval?: number;
  /** Auto-start polling (default true) */
  autoStart?: boolean;
  /** Called when import completes */
  onComplete?: (progress: ImportProgress) => void;
}

export function useImportProgress(
  jobId: string | null,
  options?: UseImportProgressOptions,
) {
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onCompleteRef = useRef(options?.onComplete);
  onCompleteRef.current = options?.onComplete;

  const pollInterval = options?.interval ?? 2000;

  const fetchProgress = useCallback(async () => {
    if (!jobId) return null;
    try {
      const res = await apiFetch<{ data: ImportProgress }>(
        `/api/v1/import/jobs/${jobId}/progress`,
      );
      setProgress(res.data);

      if (res.data.isComplete) {
        stopPolling();
        onCompleteRef.current?.(res.data);
      }

      return res.data;
    } catch {
      return null;
    }
  }, [jobId]);

  const startPolling = useCallback(() => {
    if (intervalRef.current) return;
    setIsPolling(true);
    // Fetch immediately
    fetchProgress();
    // Then poll
    intervalRef.current = setInterval(fetchProgress, pollInterval);
  }, [fetchProgress, pollInterval]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  // Auto-start
  useEffect(() => {
    if (jobId && options?.autoStart !== false) {
      startPolling();
    }
    return () => stopPolling();
  }, [jobId, options?.autoStart, startPolling, stopPolling]);

  return { progress, isPolling, startPolling, stopPolling, fetchProgress };
}
