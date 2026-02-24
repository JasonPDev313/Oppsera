'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';

// ── Types ──────────────────────────────────────────────────────────

export interface DigestMetric {
  slug: string;
  value: number;
  change: number;
  direction: 'up' | 'down' | 'flat';
}

export interface DigestEntry {
  id: string;
  name: string;
  reportType: string;
  frequency: string;
  config: Record<string, unknown>;
  isActive: boolean;
  lastDeliveredAt: string | null;
  nextDeliveryAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DigestsListResponse {
  data: DigestEntry[];
  meta: { cursor: string | null; hasMore: boolean };
}

// ── Hook ───────────────────────────────────────────────────────────

export function useDigests() {
  const [digests, setDigests] = useState<DigestEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  // ── Fetch digest-type scheduled reports ──
  const loadDigests = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch<DigestsListResponse>(
        '/api/v1/semantic/scheduled-reports?activeOnly=true',
      );
      if (!mountedRef.current) return;
      // Filter to only digest-type reports on the client
      const digestReports = res.data.filter((r) => r.reportType === 'digest');
      setDigests(digestReports);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load digests');
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  // ── Auto-load on mount ──
  useEffect(() => {
    mountedRef.current = true;
    loadDigests();
    return () => { mountedRef.current = false; };
  }, [loadDigests]);

  // ── Generate an on-demand digest ──
  const generateDigest = useCallback(async (): Promise<DigestEntry | null> => {
    try {
      const res = await apiFetch<{ data: DigestEntry }>('/api/v1/semantic/scheduled-reports', {
        method: 'POST',
        body: JSON.stringify({
          name: `On-Demand Digest — ${new Date().toLocaleDateString()}`,
          reportType: 'digest',
          frequency: 'daily',
          deliveryHour: new Date().getHours(),
          channel: 'in_app',
          recipientType: 'self',
        }),
      });
      setDigests((prev) => [...prev, res.data]);
      return res.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate digest';
      setError(msg);
      throw err;
    }
  }, []);

  return { digests, generateDigest, isLoading, error, refresh: loadDigests };
}
