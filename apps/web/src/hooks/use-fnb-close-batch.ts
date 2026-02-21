'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';

interface CloseBatchDetail {
  id: string;
  locationId: string;
  businessDate: string;
  status: string;
  startingFloatCents: number;
  openedBy: string;
  openedAt: string;
  lockedAt: string | null;
  lockedBy: string | null;
  postedAt: string | null;
  reconciledAt: string | null;
}

interface ZReportData {
  closeBatchId: string;
  businessDate: string;
  grossSalesCents: number;
  netSalesCents: number;
  taxCollectedCents: number;
  discountTotalCents: number;
  compTotalCents: number;
  voidTotalCents: number;
  refundTotalCents: number;
  tenderBreakdown: Record<string, number>;
  tipsTotalCents: number;
  coverCount: number;
  tabCount: number;
  avgCheckCents: number;
}

interface ServerCheckout {
  id: string;
  serverUserId: string;
  serverName: string | null;
  status: string;
  tabCount: number;
  salesCents: number;
  tipsCents: number;
  cashOwedCents: number;
}

interface UseCloseBatchOptions {
  closeBatchId?: string;
}

export function useCloseBatch({ closeBatchId }: UseCloseBatchOptions) {
  const [batch, setBatch] = useState<CloseBatchDetail | null>(null);
  const [zReport, setZReport] = useState<ZReportData | null>(null);
  const [checkouts, setCheckouts] = useState<ServerCheckout[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isActing, setIsActing] = useState(false);

  const refresh = useCallback(async () => {
    if (!closeBatchId) return;
    setIsLoading(true);
    try {
      const [batchRes, zRes, coRes] = await Promise.all([
        apiFetch<{ data: CloseBatchDetail }>(`/api/v1/fnb/close-batch/${closeBatchId}`),
        apiFetch<{ data: ZReportData }>(`/api/v1/fnb/close-batch/${closeBatchId}/z-report`).catch(() => null),
        apiFetch<{ data: ServerCheckout[] }>(`/api/v1/fnb/close-batch/${closeBatchId}/server-checkouts`),
      ]);
      setBatch(batchRes.data);
      if (zRes) setZReport(zRes.data);
      setCheckouts(coRes.data);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [closeBatchId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const startBatch = useCallback(async (input: Record<string, unknown>) => {
    setIsActing(true);
    try {
      const res = await apiFetch<{ data: CloseBatchDetail }>('/api/v1/fnb/close-batch', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      return res.data;
    } finally {
      setIsActing(false);
    }
  }, []);

  const lockBatch = useCallback(async () => {
    if (!closeBatchId) return;
    setIsActing(true);
    try {
      await apiFetch(`/api/v1/fnb/close-batch/${closeBatchId}/lock`, { method: 'POST' });
      await refresh();
    } finally {
      setIsActing(false);
    }
  }, [closeBatchId, refresh]);

  const postBatch = useCallback(async () => {
    if (!closeBatchId) return;
    setIsActing(true);
    try {
      await apiFetch(`/api/v1/fnb/close-batch/${closeBatchId}/post`, {
        method: 'POST',
        body: JSON.stringify({ closeBatchId }),
      });
      await refresh();
    } finally {
      setIsActing(false);
    }
  }, [closeBatchId, refresh]);

  const reconcileBatch = useCallback(async (notes?: string) => {
    if (!closeBatchId) return;
    setIsActing(true);
    try {
      await apiFetch(`/api/v1/fnb/close-batch/${closeBatchId}/reconcile`, {
        method: 'POST',
        body: JSON.stringify({ closeBatchId, notes }),
      });
      await refresh();
    } finally {
      setIsActing(false);
    }
  }, [closeBatchId, refresh]);

  const recordCashCount = useCallback(async (input: Record<string, unknown>) => {
    if (!closeBatchId) return;
    setIsActing(true);
    try {
      await apiFetch(`/api/v1/fnb/close-batch/${closeBatchId}/cash-count`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
      await refresh();
    } finally {
      setIsActing(false);
    }
  }, [closeBatchId, refresh]);

  const recordCashDrop = useCallback(async (input: Record<string, unknown>) => {
    if (!closeBatchId) return;
    setIsActing(true);
    try {
      await apiFetch(`/api/v1/fnb/close-batch/${closeBatchId}/cash-drops`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
      await refresh();
    } finally {
      setIsActing(false);
    }
  }, [closeBatchId, refresh]);

  const recordDeposit = useCallback(async (input: Record<string, unknown>) => {
    if (!closeBatchId) return;
    setIsActing(true);
    try {
      await apiFetch(`/api/v1/fnb/close-batch/${closeBatchId}/deposit`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
      await refresh();
    } finally {
      setIsActing(false);
    }
  }, [closeBatchId, refresh]);

  return {
    batch,
    zReport,
    checkouts,
    isLoading,
    isActing,
    refresh,
    startBatch,
    lockBatch,
    postBatch,
    reconcileBatch,
    recordCashCount,
    recordCashDrop,
    recordDeposit,
  };
}
