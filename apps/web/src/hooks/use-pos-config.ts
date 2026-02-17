'use client';

import { useState, useEffect, useCallback } from 'react';
import type { POSConfig } from '@/types/pos';

const STORAGE_KEY_PREFIX = 'pos_config_';

function getDefaultConfig(locationId: string, mode: 'retail' | 'fnb'): POSConfig {
  if (mode === 'fnb') {
    return {
      posMode: 'fnb',
      terminalId: `terminal_${locationId}_1`,
      locationId,
      defaultServiceCharges: [],
      tipEnabled: true,
      receiptMode: 'ask',
      barcodeEnabled: false,
      kitchenSendEnabled: true,
    };
  }

  return {
    posMode: 'retail',
    terminalId: `terminal_${locationId}_1`,
    locationId,
    defaultServiceCharges: [],
    tipEnabled: false,
    receiptMode: 'ask',
    barcodeEnabled: true,
    kitchenSendEnabled: false,
  };
}

function loadConfigFromStorage(locationId: string): POSConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${locationId}`);
    if (!raw) return null;
    return JSON.parse(raw) as POSConfig;
  } catch {
    return null;
  }
}

function saveConfigToStorage(locationId: string, config: POSConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${locationId}`, JSON.stringify(config));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

export function usePOSConfig(locationId: string, defaultMode: 'retail' | 'fnb' = 'retail') {
  const [config, setConfigState] = useState<POSConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load config from localStorage on mount or when locationId changes
  useEffect(() => {
    setIsLoading(true);
    const stored = loadConfigFromStorage(locationId);
    if (stored) {
      // Ensure locationId is current (in case user switched locations)
      setConfigState({ ...stored, locationId });
    } else {
      const defaults = getDefaultConfig(locationId, defaultMode);
      saveConfigToStorage(locationId, defaults);
      setConfigState(defaults);
    }
    setIsLoading(false);
  }, [locationId, defaultMode]);

  const setConfig = useCallback(
    (updates: Partial<POSConfig>) => {
      setConfigState((prev) => {
        if (!prev) return prev;
        const next: POSConfig = { ...prev, ...updates, locationId };
        saveConfigToStorage(locationId, next);
        return next;
      });
    },
    [locationId],
  );

  return { config, setConfig, isLoading };
}
