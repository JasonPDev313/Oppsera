'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';

interface FnbSettingsResult {
  moduleKey: string;
  settings: Record<string, unknown>;
}

// ── Module-level settings cache ────────────────────────────────
// Settings rarely change during a shift. Cache per moduleKey+locationId
// to eliminate redundant API calls on every POS screen mount.

const _settingsCache = new Map<string, { data: Record<string, unknown>; ts: number }>();
const SETTINGS_CACHE_TTL_MS = 10 * 60_000; // 10 minutes
const _settingsInflight = new Map<string, Promise<Record<string, unknown>>>();

function settingsCacheKey(moduleKey: string, locationId?: string): string {
  return `${moduleKey}:${locationId ?? ''}`;
}

function getCachedSettings(key: string): Record<string, unknown> | undefined {
  const entry = _settingsCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > SETTINGS_CACHE_TTL_MS) {
    _settingsCache.delete(key);
    return undefined;
  }
  return entry.data;
}

/**
 * Pre-warm F&B settings cache. Fire-and-forget.
 */
export async function warmFnbSettings(moduleKey: string, locationId?: string): Promise<void> {
  const key = settingsCacheKey(moduleKey, locationId);
  if (getCachedSettings(key)) return;
  // Dedup in-flight
  if (_settingsInflight.has(key)) return;
  const promise = (async () => {
    try {
      const qs = locationId ? `?locationId=${locationId}` : '';
      const res = await apiFetch<{ data: FnbSettingsResult }>(
        `/api/v1/fnb/settings/${moduleKey}${qs}`,
      );
      _settingsCache.set(key, { data: res.data.settings, ts: Date.now() });
      return res.data.settings;
    } finally {
      _settingsInflight.delete(key);
    }
  })();
  _settingsInflight.set(key, promise);
  await promise;
}

interface UseFnbSettingsOptions {
  moduleKey: string;
  locationId?: string;
}

export function useFnbSettings({ moduleKey, locationId }: UseFnbSettingsOptions) {
  const key = settingsCacheKey(moduleKey, locationId);
  const [settings, setSettings] = useState<Record<string, unknown>>(
    () => getCachedSettings(key) ?? {},
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isActing, setIsActing] = useState(false);

  const refresh = useCallback(async () => {
    if (!moduleKey) return;
    // Only show loading if cache is empty
    const cached = getCachedSettings(key);
    if (!cached) setIsLoading(true);
    try {
      const qs = locationId ? `?locationId=${locationId}` : '';
      const res = await apiFetch<{ data: FnbSettingsResult }>(
        `/api/v1/fnb/settings/${moduleKey}${qs}`,
      );
      _settingsCache.set(key, { data: res.data.settings, ts: Date.now() });
      setSettings(res.data.settings);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [moduleKey, locationId, key]);

  useEffect(() => {
    // If we have fresh cache, skip the fetch entirely
    const cached = getCachedSettings(key);
    if (cached) {
      setSettings(cached);
      return;
    }
    refresh();
  }, [refresh, key]);

  const updateSettings = useCallback(
    async (newSettings: Record<string, unknown>) => {
      setIsActing(true);
      try {
        const res = await apiFetch<{ data: FnbSettingsResult }>(
          `/api/v1/fnb/settings/${moduleKey}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ settings: newSettings, locationId }),
          },
        );
        setSettings(res.data.settings);
        return res.data;
      } finally {
        setIsActing(false);
      }
    },
    [moduleKey, locationId],
  );

  const updateSetting = useCallback(
    async (settingKey: string, value: unknown) => {
      setIsActing(true);
      try {
        const res = await apiFetch<{ data: unknown }>(
          `/api/v1/fnb/settings/${moduleKey}/${settingKey}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ value, locationId }),
          },
        );
        await refresh();
        return res.data;
      } finally {
        setIsActing(false);
      }
    },
    [moduleKey, locationId, refresh],
  );

  return { settings, isLoading, isActing, refresh, updateSettings, updateSetting };
}
