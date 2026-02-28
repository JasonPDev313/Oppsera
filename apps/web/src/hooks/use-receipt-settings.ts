/**
 * Receipt Settings Hook
 *
 * Module-level 10-minute cache with in-flight deduplication.
 * Returns { settings, isLoading, updateSettings, refresh }.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { ReceiptSettings, UpdateReceiptSettings } from '@oppsera/shared';
import { DEFAULT_RECEIPT_SETTINGS } from '@oppsera/shared';

// ── Module-level cache ──────────────────────────────────────────

interface CacheEntry {
  settings: ReceiptSettings;
  fetchedAt: number;
  key: string;
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
let _cache: CacheEntry | null = null;
let _inflight: Promise<ReceiptSettings> | null = null;

function cacheKey(locationId?: string): string {
  return `receipt-settings:${locationId ?? '__global__'}`;
}

function getCached(key: string): ReceiptSettings | null {
  if (!_cache || _cache.key !== key) return null;
  if (Date.now() - _cache.fetchedAt > CACHE_TTL_MS) {
    _cache = null;
    return null;
  }
  return _cache.settings;
}

function setCache(key: string, settings: ReceiptSettings): void {
  _cache = { settings, fetchedAt: Date.now(), key };
}

function invalidateCache(): void {
  _cache = null;
}

// ── Hook ────────────────────────────────────────────────────────

export function useReceiptSettings(locationId?: string) {
  const [settings, setSettings] = useState<ReceiptSettings>(DEFAULT_RECEIPT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    const key = cacheKey(locationId);
    const cached = getCached(key);
    if (cached) {
      setSettings(cached);
      setIsLoading(false);
      return;
    }

    // Deduplicate in-flight requests
    if (!_inflight) {
      _inflight = apiFetch<{ data: ReceiptSettings }>(
        `/api/v1/receipts/settings${locationId ? `?locationId=${locationId}` : ''}`,
      )
        .then((res) => {
          const s = res.data ?? DEFAULT_RECEIPT_SETTINGS;
          setCache(key, s);
          return s;
        })
        .finally(() => {
          _inflight = null;
        });
    }

    try {
      const s = await _inflight;
      if (mountedRef.current) {
        setSettings(s);
        setIsLoading(false);
      }
    } catch {
      if (mountedRef.current) {
        setSettings(DEFAULT_RECEIPT_SETTINGS);
        setIsLoading(false);
      }
    }
  }, [locationId]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  const updateSettings = useCallback(
    async (patch: UpdateReceiptSettings): Promise<ReceiptSettings> => {
      const res = await apiFetch<{ data: ReceiptSettings }>(
        '/api/v1/receipts/settings',
        {
          method: 'PATCH',
          body: JSON.stringify({ locationId: locationId ?? null, ...patch }),
        },
      );
      const updated = res.data;
      setCache(cacheKey(locationId), updated);
      setSettings(updated);
      return updated;
    },
    [locationId],
  );

  const refresh = useCallback(() => {
    invalidateCache();
    setIsLoading(true);
    load();
  }, [load]);

  return { settings, isLoading, updateSettings, refresh };
}
