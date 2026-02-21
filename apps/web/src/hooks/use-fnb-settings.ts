'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';

interface FnbSettingsResult {
  moduleKey: string;
  settings: Record<string, unknown>;
}

interface UseFnbSettingsOptions {
  moduleKey: string;
  locationId?: string;
}

export function useFnbSettings({ moduleKey, locationId }: UseFnbSettingsOptions) {
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isActing, setIsActing] = useState(false);

  const refresh = useCallback(async () => {
    if (!moduleKey) return;
    setIsLoading(true);
    try {
      const qs = locationId ? `?locationId=${locationId}` : '';
      const res = await apiFetch<{ data: FnbSettingsResult }>(
        `/api/v1/fnb/settings/${moduleKey}${qs}`,
      );
      setSettings(res.data.settings);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [moduleKey, locationId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
