'use client';

import { useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import type { RetailCloseBatch } from '@oppsera/core/retail-close';

export function useRetailClose() {
  const { toast } = useToast();
  const [batch, setBatch] = useState<RetailCloseBatch | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isActing, setIsActing] = useState(false);

  const fetchBatch = useCallback(async (batchId: string) => {
    setIsLoading(true);
    try {
      const resp = await apiFetch<{ data: RetailCloseBatch }>(
        `/api/v1/retail-close/${batchId}`,
      );
      setBatch(resp.data);
    } catch {
      toast.error('Failed to load close batch');
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const fetchByTerminalDate = useCallback(async (terminalId: string, businessDate: string) => {
    setIsLoading(true);
    try {
      const resp = await apiFetch<{ data: RetailCloseBatch | null }>(
        `/api/v1/retail-close?terminalId=${encodeURIComponent(terminalId)}&businessDate=${encodeURIComponent(businessDate)}`,
      );
      setBatch(resp.data);
      return resp.data;
    } catch {
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const startClose = useCallback(async (input: {
    terminalId: string;
    locationId: string;
    businessDate?: string;
    drawerSessionId?: string;
  }) => {
    setIsActing(true);
    try {
      const resp = await apiFetch<{ data: RetailCloseBatch }>('/api/v1/retail-close', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      setBatch(resp.data);
      toast.success('Close batch started');
      return resp.data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start close';
      toast.error(message);
      return null;
    } finally {
      setIsActing(false);
    }
  }, [toast]);

  const reconcile = useCallback(async (cashCountedCents: number, notes?: string) => {
    if (!batch) return null;
    setIsActing(true);
    try {
      const resp = await apiFetch<{ data: RetailCloseBatch }>(
        `/api/v1/retail-close/${batch.id}/reconcile`,
        {
          method: 'POST',
          body: JSON.stringify({ cashCountedCents, notes }),
        },
      );
      setBatch(resp.data);

      const overShort = resp.data.cashOverShortCents ?? 0;
      if (overShort === 0) {
        toast.success('Cash balanced — ready to post');
      } else {
        const dir = overShort > 0 ? 'over' : 'short';
        toast.info(`Cash ${dir} by $${(Math.abs(overShort) / 100).toFixed(2)}`);
      }
      return resp.data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to reconcile';
      toast.error(message);
      return null;
    } finally {
      setIsActing(false);
    }
  }, [batch, toast]);

  const postToGL = useCallback(async () => {
    if (!batch) return null;
    setIsActing(true);
    try {
      const resp = await apiFetch<{ data: RetailCloseBatch }>(
        `/api/v1/retail-close/${batch.id}/post`,
        { method: 'POST' },
      );
      setBatch(resp.data);
      toast.success(resp.data.glJournalEntryId ? 'Posted to GL' : 'Posted (GL skipped — no mappings)');
      return resp.data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to post';
      toast.error(message);
      return null;
    } finally {
      setIsActing(false);
    }
  }, [batch, toast]);

  const lock = useCallback(async () => {
    if (!batch) return null;
    setIsActing(true);
    try {
      const resp = await apiFetch<{ data: RetailCloseBatch }>(
        `/api/v1/retail-close/${batch.id}/lock`,
        { method: 'POST' },
      );
      setBatch(resp.data);
      toast.success('Batch locked');
      return resp.data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to lock';
      toast.error(message);
      return null;
    } finally {
      setIsActing(false);
    }
  }, [batch, toast]);

  return {
    batch,
    isLoading,
    isActing,
    fetchBatch,
    fetchByTerminalDate,
    startClose,
    reconcile,
    postToGL,
    lock,
  };
}
