'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';

// ── Types ──────────────────────────────────────────────────────────

export interface EmbedToken {
  id: string;
  token: string;
  widgetType: 'metric_card' | 'chart' | 'kpi_grid' | 'chat';
  config: EmbedWidgetConfig;
  allowedOrigins: string[] | null;
  expiresAt: string | null;
  isActive: boolean;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface EmbedWidgetConfig {
  metricSlugs?: string[];
  chartType?: 'line' | 'bar' | 'pie' | 'table';
  dimensions?: string[];
  filters?: Record<string, unknown>;
  dateRange?: { start?: string; end?: string };
  theme?: 'light' | 'dark' | 'auto';
  refreshIntervalSeconds?: number;
}

export interface CreateEmbedTokenInput {
  widgetType?: 'metric_card' | 'chart' | 'kpi_grid' | 'chat';
  config?: EmbedWidgetConfig;
  allowedOrigins?: string[];
  expiresAt?: string;
}

interface EmbedTokensListResponse {
  data: EmbedToken[];
  meta: { cursor: string | null; hasMore: boolean };
}

interface EmbedTokenResponse {
  data: EmbedToken;
}

// ── Hook ───────────────────────────────────────────────────────────

export function useEmbedWidgets() {
  const [tokens, setTokens] = useState<EmbedToken[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  // ── Fetch embed tokens ──
  const loadTokens = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch<EmbedTokensListResponse>('/api/v1/semantic/embed');
      if (!mountedRef.current) return;
      setTokens(res.data);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load embed tokens');
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  // ── Auto-load on mount ──
  useEffect(() => {
    mountedRef.current = true;
    loadTokens();
    return () => { mountedRef.current = false; };
  }, [loadTokens]);

  // ── Create a new embed token ──
  const createToken = useCallback(async (input: CreateEmbedTokenInput): Promise<EmbedToken | null> => {
    try {
      const res = await apiFetch<EmbedTokenResponse>('/api/v1/semantic/embed', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      setTokens((prev) => [...prev, res.data]);
      return res.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create embed token';
      setError(msg);
      throw err;
    }
  }, []);

  // ── Revoke (delete) an embed token ──
  const revokeToken = useCallback(async (id: string): Promise<void> => {
    // Optimistic removal
    setTokens((prev) => prev.filter((t) => t.id !== id));

    try {
      await apiFetch(`/api/v1/semantic/embed/${id}`, {
        method: 'DELETE',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to revoke embed token';
      setError(msg);
      loadTokens();
      throw err;
    }
  }, [loadTokens]);

  return { tokens, createToken, revokeToken, isLoading, error, refresh: loadTokens };
}
